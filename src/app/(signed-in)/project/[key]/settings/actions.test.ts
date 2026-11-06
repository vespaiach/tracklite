import { randomUUID } from "node:crypto";
import { eq, inArray, or } from "drizzle-orm";
import { refresh } from "next/cache";
import { expect, it } from "vitest";
import { db } from "../../../../../infrastructure/db";
import { comments } from "../../../../../infrastructure/comments/tables";
import { createSession, sessionCookieName } from "../../../../../infrastructure/identity/session";
import type { Member } from "../../../../../infrastructure/identity/tables";
import { issueLabels, issues } from "../../../../../infrastructure/issues/tables";
import { mentions, notifications } from "../../../../../infrastructure/notifications/tables";
import { labels, projectKeys, projects } from "../../../../../infrastructure/projects/tables";
import {
  createIssue,
  createMember,
  createNotificationBatch,
  createProject,
} from "../../../../../test/factories";
import { setNextRequest } from "../../../../../test/next-request";
import { archiveProject, deleteProject, renameProject } from "./actions";

async function signedInAdmin() {
  const admin = await createMember({ role: "admin" });
  await startSessionFor(admin);
  return admin;
}

async function startSessionFor(member: Member) {
  setNextRequest({ cookies: { [sessionCookieName()]: await createSession(member.id) } });
}

function renameForm(key: string, name: string) {
  const form = new FormData();
  form.set("key", key);
  form.set("name", name);
  return form;
}

async function storedProject(id: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  return project;
}

function fieldError(fields: Record<string, string>) {
  return { ok: false, error: { kind: "invalid", message: "Check the highlighted fields", fields } };
}

const done = { ok: true, data: null };
const notFound = { ok: false, error: { kind: "notFound", message: "Not found" } };

it("REQ-011.1: renaming keeps the key and every issue ID, answers with the trimmed name and refreshes the page", async () => {
  await signedInAdmin();
  const project = await createProject({ name: "Website" });
  const issue = await createIssue(project.id);

  expect(await renameProject(renameForm(project.key, "  Marketing site "))).toEqual({
    ok: true,
    data: { name: "Marketing site" },
  });

  expect(refresh).toHaveBeenCalledOnce();
  expect(await storedProject(project.id)).toMatchObject({ key: project.key, name: "Marketing site" });
  const [stored] = await db.select().from(issues).where(eq(issues.id, issue.id));
  expect(stored).toMatchObject({ projectId: project.id, number: issue.number });
});

it("REQ-011: a blank name or a 51-character name get field errors and change nothing", async () => {
  await signedInAdmin();
  const project = await createProject({ name: "Website" });

  expect(await renameProject(renameForm(project.key, "  "))).toEqual(fieldError({ name: "Name required" }));
  expect(await renameProject(renameForm(project.key, "x".repeat(51)))).toEqual(
    fieldError({ name: "Too long (max 50)" }),
  );

  expect(await storedProject(project.id)).toMatchObject({ name: "Website" });
});

it("REQ-013.1: archiving sets archivedAt and REQ-013.3: unarchiving clears it, each refreshing the page", async () => {
  await signedInAdmin();
  const project = await createProject();

  expect(await archiveProject({ key: project.key, archived: true })).toEqual(done);
  expect((await storedProject(project.id)).archivedAt).not.toBeNull();

  expect(await archiveProject({ key: project.key, archived: false })).toEqual(done);
  expect((await storedProject(project.id)).archivedAt).toBeNull();
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("REQ-013.7, REQ-013.4: renaming an archived project is refused and nothing changes", async () => {
  await signedInAdmin();
  const project = await createProject({ name: "Website", archivedAt: new Date() });

  expect(await renameProject(renameForm(project.key, "Old website"))).toEqual({
    ok: false,
    error: { kind: "forbidden", message: "This project is archived" },
  });

  expect((await storedProject(project.id)).name).toBe("Website");
});

it("REQ-014.1, STD-4: a deleted project is gone and its issues with it", async () => {
  await signedInAdmin();
  const project = await createProject();
  const issue = await createIssue(project.id);

  expect(await deleteProject({ key: project.key })).toEqual(done);

  expect(refresh).toHaveBeenCalledOnce();
  expect(await storedProject(project.id)).toBeUndefined();
  expect(await db.select().from(issues).where(eq(issues.id, issue.id))).toEqual([]);
});

it("REQ-014.3: the next action on a project deleted meanwhile is Not found", async () => {
  await signedInAdmin();
  const project = await createProject();
  await deleteProject({ key: project.key });
  await signedInAdmin();

  expect(await renameProject(renameForm(project.key, "Too late"))).toEqual(notFound);
  expect(await archiveProject({ key: project.key, archived: true })).toEqual(notFound);
  expect(await deleteProject({ key: project.key })).toEqual(notFound);
});

it("REQ-014.4: an archived project is deleted like an active one", async () => {
  await signedInAdmin();
  const project = await createProject({ archivedAt: new Date() });

  expect(await deleteProject({ key: project.key })).toEqual(done);
  expect(await storedProject(project.id)).toBeUndefined();
});

it("DATA-002.1: deleting a project removes everything in it but keeps its key and notifications", async () => {
  const admin = await signedInAdmin();
  const sam = await createMember();
  const project = await createProject();
  const issue = await createIssue(project.id);
  const [label] = await db
    .insert(labels)
    .values({ projectId: project.id, name: "bug", color: "red" })
    .returning();
  await db.insert(issueLabels).values({ issueId: issue.id, labelId: label.id });
  const [issueComment] = await db
    .insert(comments)
    .values({ issueId: issue.id, authorId: admin.id, body: "On the issue", requestId: randomUUID() })
    .returning();
  const [projectComment] = await db
    .insert(comments)
    .values({ projectId: project.id, authorId: admin.id, body: "On the project", requestId: randomUUID() })
    .returning();
  await db.insert(mentions).values([
    { memberId: sam.id, issueId: issue.id },
    { memberId: sam.id, projectId: project.id },
    { memberId: sam.id, commentId: issueComment.id },
  ]);
  const { batch } = await createNotificationBatch({
    recipientId: sam.id,
    targetType: "issue",
    targetId: issue.id,
    sendAfter: new Date(),
  });
  await db.insert(notifications).values({
    batchId: batch.id,
    kind: "mentioned",
    actorId: admin.id,
    projectName: project.name,
    projectKey: project.key,
    linkPath: `/issue/${project.key}-1`,
    excerpt: "@sam",
  });

  expect(await deleteProject({ key: project.key })).toEqual(done);

  expect(await db.select().from(issues).where(eq(issues.projectId, project.id))).toEqual([]);
  expect(await db.select().from(labels).where(eq(labels.projectId, project.id))).toEqual([]);
  expect(await db.select().from(issueLabels).where(eq(issueLabels.labelId, label.id))).toEqual([]);
  expect(
    await db
      .select()
      .from(comments)
      .where(inArray(comments.id, [issueComment.id, projectComment.id])),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(mentions)
      .where(
        or(
          eq(mentions.issueId, issue.id),
          eq(mentions.projectId, project.id),
          eq(mentions.commentId, issueComment.id),
        ),
      ),
  ).toEqual([]);
  expect(await db.select().from(projectKeys).where(eq(projectKeys.key, project.key))).toHaveLength(1);
  expect(await db.select().from(notifications).where(eq(notifications.batchId, batch.id))).toHaveLength(1);
});