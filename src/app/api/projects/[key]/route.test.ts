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

it("REQ-013.7: renaming an archived project is refused and the name is unchanged", async () => {
  const { cookie } = await signedIn("admin");
  const project = await createProject({ name: "Website", archivedAt: new Date() });

  const response = await patchWith(cookie, project.key, { name: "Old website" });

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: { message: "This project is archived" } });
  expect((await storedProject(project.id)).name).toBe("Website");
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

it("REQ-012.1: a member saves a description with a heading and a bullet list", async () => {
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
});

it("REQ-012: an empty description is allowed", async () => {
  const { cookie } = await signedIn("member");
  const project = await createProject({ description: "Old text" });

  const response = await saveDescription(cookie, project.key, "", 0);

  expect(response.status).toBe(200);
  expect((await storedProject(project.id)).description).toBe("");
});

it('REQ-012.2: a description of 20,001 characters gets the field error "Too long (max 20,000)"', async () => {
  const { cookie } = await signedIn("member");
  const project = await createProject({ description: "Old text" });

  const tooLong = await saveDescription(cookie, project.key, "x".repeat(20_001), 0);

  expect(tooLong.status).toBe(422);
  expect(await tooLong.json()).toEqual({
    error: { message: "Check the highlighted fields", fields: { description: "Too long (max 20,000)" } },
  });
  expect(await storedProject(project.id)).toMatchObject({ description: "Old text", descriptionVersion: 0 });

  const longest = await saveDescription(cookie, project.key, "x".repeat(20_000), 0);
  expect(longest.status).toBe(200);
});

it("REQ-012.3: a description with <script>alert(1)</script> is stored as sent", async () => {
  const { cookie } = await signedIn("member");
  const project = await createProject();

  const response = await saveDescription(cookie, project.key, "<script>alert(1)</script>", 0);

  expect(response.status).toBe(200);
  expect((await storedProject(project.id)).description).toBe("<script>alert(1)</script>");
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

it("STD-8: a description save without a whole-number descriptionVersion is refused", async () => {
  const { cookie } = await signedIn("member");
  const project = await createProject({ description: "Old text" });

  for (const body of [{ description: "New" }, { description: "New", descriptionVersion: "0" }]) {
    const response = await patchWith(cookie, project.key, body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { fields: { descriptionVersion: expect.any(String) } },
    });
  }
  expect((await storedProject(project.id)).description).toBe("Old text");
});

it("DATA-001: saving a description mentions active members only, outside code", async () => {
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
});

it("DATA-001: mention rows follow the current description text", async () => {
  const { cookie } = await signedIn("member");
  const sam = await createMember();
  const alex = await createMember();
  const project = await createProject();

  await saveDescription(cookie, project.key, `Hi @${sam.username}`, 0);
  const response = await saveDescription(cookie, project.key, `Hi @${alex.username}`, 1);

  expect(response.status).toBe(200);
  expect(await mentionedMemberIds(project.id)).toEqual([alex.id]);
});

it("REQ-013.4: a description save to an archived project is refused with This project is archived", async () => {
  const { cookie } = await signedIn("member");
  const project = await createProject({ description: "Old text", archivedAt: new Date() });

  const response = await saveDescription(cookie, project.key, "New text", 0);

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: { message: "This project is archived" } });
  expect(await storedProject(project.id)).toMatchObject({ description: "Old text", descriptionVersion: 0 });
});