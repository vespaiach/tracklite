import { randomUUID } from "node:crypto";
import { eq, inArray, or } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../server/shared/db";
import { comments } from "../../../../server/comments";
import { issueLabels, issues } from "../../../../server/issues";
import { labels, projectKeys, projects } from "../../../../server/projects";
import { mentions, notifications } from "../../../../server/notifications";
import { createSession, type Member } from "../../../../server/identity";
import { createMember, createNotificationBatch, createProject } from "../../../../test/factories";
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

it("REQ-016: a project is found by its key ignoring capitals", async () => {
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
    issueCounts: { backlog: 0, in_progress: 0, in_review: 0, done: 0, canceled: 0 },
    createdAt: project.createdAt.toISOString(),
    createdBy: null,
  });
});

it("REQ-046.3: the details response counts the project's issues in every status and leaves out other projects' issues", async () => {
  const { member, cookie } = await signedIn("member");
  const web = await createProject();
  const api = await createProject();
  const statuses = ["backlog", "backlog", "backlog", "in_progress", "done", "done"] as const;
  for (const [index, status] of statuses.entries()) {
    const issue = await createIssue(web.id, member, index + 1);
    await db.update(issues).set({ status }).where(eq(issues.id, issue.id));
  }
  await createIssue(api.id, member, 1);

  const response = await getWith(cookie, web.key);

  expect((await response.json()).issueCounts).toEqual({
    backlog: 3,
    in_progress: 1,
    in_review: 0,
    done: 2,
    canceled: 0,
  });
});

it("REQ-046.4: the details response names when and by whom the project was created", async () => {
  const { cookie } = await signedIn("member");
  const alex = await createMember({ fullName: "Alex Kim", role: "admin" });
  const project = await createProject({ createdBy: alex.id });

  const response = await getWith(cookie, project.key);

  expect(await response.json()).toMatchObject({
    createdAt: project.createdAt.toISOString(),
    createdBy: { username: alex.username, fullName: "Alex Kim", initials: "AK", deactivated: false },
  });
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

it("REQ-010.1, REQ-011: changing the key, a blank name or a 51-character name get field errors and change nothing", async () => {
  const { cookie } = await signedIn("admin");
  const project = await createProject({ name: "Website" });

  for (const [body, fields] of [
    [{ key: "SITE" }, { key: "Key can't be changed" }],
    [{ name: "  " }, { name: "Name required" }],
    [{ name: "x".repeat(51) }, { name: "Too long (max 50)" }],
  ]) {
    const response = await patchWith(cookie, project.key, body);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: { message: "Check the highlighted fields", fields } });
  }
  expect(await storedProject(project.id)).toMatchObject({ key: project.key, name: "Website" });
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

it("REQ-013.7, REQ-013.4: on an archived project, a rename and a description save are refused and nothing changes", async () => {
  const { cookie } = await signedIn("admin");
  const project = await createProject({ name: "Website", description: "Old text", archivedAt: new Date() });

  const renamed = await patchWith(cookie, project.key, { name: "Old website" });
  const described = await saveDescription(cookie, project.key, "New text", 0);

  for (const response of [renamed, described]) {
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { message: "This project is archived" } });
  }
  expect(await storedProject(project.id)).toMatchObject({
    name: "Website",
    description: "Old text",
    descriptionVersion: 0,
  });
});

it("REQ-014.1, STD-4: a deleted project is gone and its issues are Not found", async () => {
  const { member: admin, cookie } = await signedIn("admin");
  const project = await createProject();
  const issue = await createIssue(project.id, admin, 42);

  const response = await deleteWith(cookie, project.key);

  expect(response.status).toBe(204);
  const opened = await getWith(cookie, project.key);
  expect(opened.status).toBe(404);
  expect(await opened.json()).toEqual(notFound);
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
  expect(await db.select().from(notifications).where(eq(notifications.batchId, batch.id))).toHaveLength(1);
});

function saveDescription(cookie: string, key: string, description: string, descriptionVersion: number) {
  return patchWith(cookie, key, { description, descriptionVersion });
}

async function mentionedMemberIds(projectId: string) {
  const rows = await db
    .select({ memberId: mentions.memberId })
    .from(mentions)
    .where(eq(mentions.projectId, projectId));
  return rows.map((row) => row.memberId).sort();
}

it("REQ-012.1, REQ-012.3, REQ-012: a member's description is stored as sent, whether markdown, <script>alert(1)</script> or empty", async () => {
  const { cookie } = await signedIn("member");
  const project = await createProject();
  const description = "# Goals\n\n- Faster pages\n- Fewer bugs";

  const response = await saveDescription(cookie, project.key, description, 0);

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ description, descriptionVersion: 1 });
  expect(await (await getWith(cookie, project.key)).json()).toMatchObject({
    description,
    descriptionVersion: 1,
  });

  expect((await saveDescription(cookie, project.key, "<script>alert(1)</script>", 1)).status).toBe(200);
  expect((await storedProject(project.id)).description).toBe("<script>alert(1)</script>");

  expect((await saveDescription(cookie, project.key, "", 2)).status).toBe(200);
  expect((await storedProject(project.id)).description).toBe("");
});

it('§3.3: a project PATCH with a description save and a name or archived gets 422 "Change one thing at a time"', async () => {
  const { cookie } = await signedIn("admin");
  const project = await createProject({ name: "Website", description: "Old text" });

  for (const extra of [{ name: "Renamed" }, { archived: true }]) {
    const response = await patchWith(cookie, project.key, {
      description: "New text",
      descriptionVersion: 0,
      ...extra,
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: { message: "Change one thing at a time" } });
  }
  expect(await storedProject(project.id)).toMatchObject({
    name: "Website",
    description: "Old text",
    descriptionVersion: 0,
    archivedAt: null,
  });
});

it('REQ-012.2, STD-8: a description of 20,001 characters gets "Too long (max 20,000)", one without a whole-number descriptionVersion is refused, and nothing is saved', async () => {
  const { cookie } = await signedIn("member");
  const project = await createProject({ description: "Old text" });

  const tooLong = await saveDescription(cookie, project.key, "x".repeat(20_001), 0);

  expect(tooLong.status).toBe(422);
  expect(await tooLong.json()).toEqual({
    error: { message: "Check the highlighted fields", fields: { description: "Too long (max 20,000)" } },
  });

  for (const body of [{ description: "New" }, { description: "New", descriptionVersion: "0" }]) {
    const unversioned = await patchWith(cookie, project.key, body);
    expect(unversioned.status).toBe(422);
    expect(await unversioned.json()).toMatchObject({
      error: { fields: { descriptionVersion: expect.any(String) } },
    });
  }
  expect(await storedProject(project.id)).toMatchObject({ description: "Old text", descriptionVersion: 0 });

  const longest = await saveDescription(cookie, project.key, "x".repeat(20_000), 0);
  expect(longest.status).toBe(200);
});

it("STD-8: a stale description save is refused with 409 naming who saved, and nothing is saved", async () => {
  const alex = await createMember({ fullName: "Alex Kim" });
  const alexCookie = `session=${await createSession(alex.id)}`;
  const { cookie: samCookie } = await signedIn("member");
  const project = await createProject({ description: "Start" });

  expect((await saveDescription(alexCookie, project.key, "Alex's text", 0)).status).toBe(200);
  const response = await saveDescription(samCookie, project.key, "Sam's text", 0);

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: { message: "This was changed by Alex Kim. Copy your text and reload." },
  });
  expect(await storedProject(project.id)).toMatchObject({
    description: "Alex's text",
    descriptionVersion: 1,
  });
});

it("DATA-001.3, DATA-001: saving a description mentions active members only, outside code, and the rows follow the current text", async () => {
  const { cookie } = await signedIn("member");
  const sam = await createMember({ fullName: "Sam Lee" });
  const jo = await createMember({ deactivatedAt: new Date() });
  const coder = await createMember();
  const project = await createProject();
  const description = `Can @${sam.username} help? Also @nobody-here, @${jo.username} and \`@${coder.username}\`.`;

  const response = await saveDescription(cookie, project.key, description, 0);

  expect(response.status).toBe(200);
  expect(await mentionedMemberIds(project.id)).toEqual([sam.id]);
  expect((await (await getWith(cookie, project.key)).json()).mentions).toEqual([
    { username: sam.username, fullName: "Sam Lee", initials: "SL", deactivated: false },
  ]);

  const alex = await createMember();
  expect((await saveDescription(cookie, project.key, `Hi @${alex.username}`, 1)).status).toBe(200);
  expect(await mentionedMemberIds(project.id)).toEqual([alex.id]);
});