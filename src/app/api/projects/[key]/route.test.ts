import { randomUUID } from "node:crypto";
import { eq, inArray, or } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../server/db";
import {
  comments,
  issueLabels,
  issues,
  labels,
  mentions,
  notificationEmails,
  notifications,
  projectKeys,
  projects,
} from "../../../../server/schema";
import { createSession, type Member } from "../../../../server/sessions";
import { createMember, createProject } from "../../../../test/factories";
import { jsonRequest } from "../../../../test/reset-links";
import { DELETE, GET, PATCH } from "./route";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function signedIn(role: "admin" | "member") {
  const member = await createMember({ role });
  return { member, cookie: `session=${await createSession(member.id)}` };
}

function getWith(cookie: string, key: string) {
  return GET(new Request(`http://localhost:3000/api/projects/${key}`, { headers: { Cookie: cookie } }), {
    params: Promise.resolve({ key }),
  });
}

function patchWith(cookie: string, key: string, body: unknown) {
  return PATCH(jsonRequest("PATCH", `/api/projects/${key}`, body, { Cookie: cookie }), {
    params: Promise.resolve({ key }),
  });
}

function deleteWith(cookie: string, key: string) {
  return DELETE(jsonRequest("DELETE", `/api/projects/${key}`, undefined, { Cookie: cookie }), {
    params: Promise.resolve({ key }),
  });
}

async function storedProject(id: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  return project;
}

async function createIssue(projectId: string, creator: Member, number: number) {
  const [issue] = await db
    .insert(issues)
    .values({
      projectId,
      number,
      title: `Issue ${number}`,
      status: "backlog",
      priority: "none",
      position: `a${number}`,
      createdBy: creator.id,
      requestId: randomUUID(),
    })
    .returning();
  return issue;
}

const notFound = { error: { message: "Not found" } };
const noPermission = { error: { message: "You don't have permission to do that." } };

it("REQ-016.5: a project is found by its key ignoring capitals", async () => {
  const { cookie } = await signedIn("member");
  const project = await createProject({ name: "Website", description: "Hello" });

  const response = await getWith(cookie, project.key.toLowerCase());

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    key: project.key,
    name: "Website",
    description: "Hello",
    descriptionVersion: 0,
    mentions: [],
    archivedAt: null,
  });
});

it("STD-4: an unknown project key is Not found", async () => {
  const { cookie } = await signedIn("member");

  const response = await getWith(cookie, "NOPE");

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual(notFound);
});

it("REQ-010.1: a request that changes the key is refused and the key stays", async () => {
  const { cookie } = await signedIn("admin");
  const project = await createProject();

  const response = await patchWith(cookie, project.key, { key: "SITE" });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: { message: "Check the highlighted fields", fields: { key: "Key can't be changed" } },
  });
  expect((await storedProject(project.id)).key).toBe(project.key);
});

it("REQ-011.1: renaming keeps the key and every issue ID", async () => {
  const { member: admin, cookie } = await signedIn("admin");
  const project = await createProject({ name: "Website" });
  const issue = await createIssue(project.id, admin, 42);

  const response = await patchWith(cookie, project.key, { name: "  Marketing site " });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ key: project.key, name: "Marketing site" });
  const [stored] = await db.select().from(issues).where(eq(issues.id, issue.id));
  expect(stored).toMatchObject({ projectId: project.id, number: 42 });
  expect(await (await getWith(cookie, project.key)).json()).toMatchObject({ name: "Marketing site" });
});

it("REQ-011: a rename follows the REQ-009 name rules", async () => {
  const { cookie } = await signedIn("admin");
  const project = await createProject({ name: "Website" });

  for (const [name, message] of [
    ["  ", "Name required"],
    ["x".repeat(51), "Too long (max 50)"],
  ]) {
    const response = await patchWith(cookie, project.key, { name });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: { message: "Check the highlighted fields", fields: { name: message } },
    });
  }
  expect((await storedProject(project.id)).name).toBe("Website");
});

it("REQ-013.1: archiving sets archivedAt and REQ-013.3: unarchiving clears it", async () => {
  const { cookie } = await signedIn("admin");
  const project = await createProject();

  const archived = await patchWith(cookie, project.key, { archived: true });
  expect(archived.status).toBe(200);
  expect(await archived.json()).toMatchObject({ archivedAt: expect.any(String) });
  expect((await storedProject(project.id)).archivedAt).not.toBeNull();

  const unarchived = await patchWith(cookie, project.key, { archived: false });
  expect(unarchived.status).toBe(200);
  expect(await unarchived.json()).toMatchObject({ archivedAt: null });
});

it("REQ-013: an admin can still rename an archived project", async () => {
  const { cookie } = await signedIn("admin");
  const project = await createProject({ name: "Website", archivedAt: new Date() });

  const response = await patchWith(cookie, project.key, { name: "Old website" });

  expect(response.status).toBe(200);
  expect((await storedProject(project.id)).name).toBe("Old website");
});

it("STD-2: a member can't rename, archive or delete a project", async () => {
  const { cookie } = await signedIn("member");
  const project = await createProject({ name: "Website" });

  for (const response of [
    await patchWith(cookie, project.key, { name: "Renamed" }),
    await patchWith(cookie, project.key, { archived: true }),
    await deleteWith(cookie, project.key),
  ]) {
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(noPermission);
  }
  expect(await storedProject(project.id)).toMatchObject({ name: "Website", archivedAt: null });
});

it("REQ-014.1: a deleted project is gone and its issues are Not found", async () => {
  const { member: admin, cookie } = await signedIn("admin");
  const project = await createProject();
  const issue = await createIssue(project.id, admin, 42);

  const response = await deleteWith(cookie, project.key);

  expect(response.status).toBe(204);
  expect((await getWith(cookie, project.key)).status).toBe(404);
  expect(await db.select().from(issues).where(eq(issues.id, issue.id))).toEqual([]);
});

it("REQ-014.3: the next action on a project deleted meanwhile is Not found", async () => {
  const { cookie: adminCookie } = await signedIn("admin");
  const { cookie: otherAdminCookie } = await signedIn("admin");
  const project = await createProject();
  await deleteWith(adminCookie, project.key);

  const response = await patchWith(otherAdminCookie, project.key, { name: "Too late" });

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual(notFound);
});

it("REQ-014.4: an archived project is deleted like an active one", async () => {
  const { cookie } = await signedIn("admin");
  const project = await createProject({ archivedAt: new Date() });

  expect((await deleteWith(cookie, project.key)).status).toBe(204);
  expect(await storedProject(project.id)).toBeUndefined();
});

it("DATA-002.1: deleting a project removes everything in it but keeps its key and notifications", async () => {
  const { member: admin, cookie } = await signedIn("admin");
  const sam = await createMember();
  const project = await createProject();
  const issue = await createIssue(project.id, admin, 1);
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
  const [email] = await db
    .insert(notificationEmails)
    .values({
      recipientId: sam.id,
      targetType: "issue",
      targetId: issue.id,
      sendAfter: new Date(),
      state: "pending",
    })
    .returning();
  await db.insert(notifications).values({
    emailId: email.id,
    kind: "mentioned",
    actorId: admin.id,
    projectName: project.name,
    projectKey: project.key,
    linkPath: `/issue/${project.key}-1`,
    excerpt: "@sam",
  });

  expect((await deleteWith(cookie, project.key)).status).toBe(204);

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
  expect(await db.select().from(notifications).where(eq(notifications.emailId, email.id))).toHaveLength(1);
});