import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../server/db";
import { comments, members, mentions, projects } from "../../../../server/schema";
import { createSession } from "../../../../server/sessions";
import { createComment, createIssue, createMember, createProject } from "../../../../test/factories";
import { jsonRequest } from "../../../../test/reset-links";
import { GET as listIssueComments } from "../../issues/[id]/comments/route";
import { DELETE, PATCH } from "./route";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function cookieOf(member: { id: string }) {
  return `session=${await createSession(member.id)}`;
}

function editWith(cookie: string, id: string, body: unknown) {
  return PATCH(jsonRequest("PATCH", `/api/comments/${id}`, body, { Cookie: cookie }), {
    params: Promise.resolve({ id }),
  });
}

function deleteWith(cookie: string, id: string) {
  return DELETE(jsonRequest("DELETE", `/api/comments/${id}`, undefined, { Cookie: cookie }), {
    params: Promise.resolve({ id }),
  });
}

async function stored(id: string) {
  const [comment] = await db.select().from(comments).where(eq(comments.id, id));
  return comment;
}

async function onIssue(authorFields: Parameters<typeof createMember>[0] = {}) {
  const author = await createMember(authorFields);
  const project = await createProject();
  const issue = await createIssue(project.id);
  const comment = await createComment({ issueId: issue.id }, author.id, "Teh fix is ready");
  return { author, project, issue, comment, displayId: `${project.key}-${issue.number}` };
}

async function archive(projectId: string) {
  await db.update(projects).set({ archivedAt: sql`now()` }).where(eq(projects.id, projectId));
}

it("REQ-033.1: Sam fixes a typo in their comment → saved and marked edited", async () => {
  const { author, comment } = await onIssue({ fullName: "Sam Lee" });
  const alex = await createMember();

  const response = await editWith(await cookieOf(author), comment.id, {
    body: `The fix is ready, @${alex.username}`,
    version: 0,
  });

  expect(response.status).toBe(200);
  const saved = await response.json();
  expect(saved).toMatchObject({
    id: comment.id,
    body: `The fix is ready, @${alex.username}`,
    editedAt: expect.any(String),
    version: 1,
    mentions: [{ username: alex.username }],
  });
  expect((await stored(comment.id)).editedAt).not.toBeNull();
  const rows = await db.select().from(mentions).where(eq(mentions.commentId, comment.id));
  expect(rows.map((row) => row.memberId)).toEqual([alex.id]);
});

it("DATA-001: comment mention rows follow the current text", async () => {
  const { author, comment } = await onIssue();
  const sam = await createMember();
  const alex = await createMember();
  const cookie = await cookieOf(author);

  await editWith(cookie, comment.id, { body: `Hi @${sam.username}`, version: 0 });
  await editWith(cookie, comment.id, { body: `Hi @${alex.username}`, version: 1 });

  const rows = await db.select().from(mentions).where(eq(mentions.commentId, comment.id));
  expect(rows.map((row) => row.memberId)).toEqual([alex.id]);
});

it("REQ-033.2: an admin can't edit Sam's comment", async () => {
  const { comment } = await onIssue();
  const admin = await createMember({ role: "admin" });

  const response = await editWith(await cookieOf(admin), comment.id, { body: "Admin words", version: 0 });

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: { message: "You don't have permission to do that." } });
  expect((await stored(comment.id)).body).toBe("Teh fix is ready");
});

it("REQ-033.3: Sam saves an edit just after an admin deleted that comment → This comment was deleted", async () => {
  const { author, comment } = await onIssue();
  const admin = await createMember({ role: "admin" });
  expect((await deleteWith(await cookieOf(admin), comment.id)).status).toBe(204);

  const response = await editWith(await cookieOf(author), comment.id, { body: "The fix", version: 0 });

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: { message: "This comment was deleted" } });
});

it("STD-8: a stale comment edit is refused with 409 naming who saved, and nothing is saved", async () => {
  const { author, comment } = await onIssue({ fullName: "Sam Lee" });
  const cookie = await cookieOf(author);

  expect((await editWith(cookie, comment.id, { body: "From the first tab", version: 0 })).status).toBe(200);
  const response = await editWith(cookie, comment.id, { body: "From the second tab", version: 0 });

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: { message: "This was changed by Sam Lee. Copy your text and reload." },
  });
  expect(await stored(comment.id)).toMatchObject({ body: "From the first tab", version: 1 });
});

it("REQ-033: an edit has the same limits as a new comment, and needs a whole-number version", async () => {
  const { author, comment } = await onIssue();
  const cookie = await cookieOf(author);

  const cases: [unknown, Record<string, string>][] = [
    [{ body: "  ", version: 0 }, { body: "Comment required" }],
    [{ body: "a".repeat(10_001), version: 0 }, { body: "Too long (max 10,000)" }],
    [{ body: "Fine", version: "0" }, { version: "Version required" }],
  ];
  for (const [body, fields] of cases) {
    const response = await editWith(cookie, comment.id, body);
    expect(response.status).toBe(422);
    expect((await response.json()).error.fields).toEqual(fields);
  }
  expect(await stored(comment.id)).toMatchObject({ body: "Teh fix is ready", version: 0, editedAt: null });
});

it("REQ-034.1: Sam deletes their own comment → it's gone for everyone, with its mentions", async () => {
  const { author, comment, displayId } = await onIssue();
  const alex = await createMember();
  const cookie = await cookieOf(author);
  await editWith(cookie, comment.id, { body: `@${alex.username}`, version: 0 });

  const response = await deleteWith(cookie, comment.id);

  expect(response.status).toBe(204);
  expect(await stored(comment.id)).toBeUndefined();
  expect(await db.select().from(mentions).where(eq(mentions.commentId, comment.id))).toEqual([]);
  const thread = await listIssueComments(
    new Request(`http://localhost:3000/api/issues/${displayId}/comments`, {
      headers: { Cookie: await cookieOf(alex) },
    }),
    { params: Promise.resolve({ id: displayId }) },
  );
  expect(await thread.json()).toEqual([]);
});

it("REQ-034.2: an admin deletes Alex's comment → it's gone", async () => {
  const { comment } = await onIssue();
  const admin = await createMember({ role: "admin" });

  expect((await deleteWith(await cookieOf(admin), comment.id)).status).toBe(204);
  expect(await stored(comment.id)).toBeUndefined();
});

it("REQ-034.3: Alex, a member, can't delete Sam's comment", async () => {
  const { comment } = await onIssue();
  const alex = await createMember();

  const response = await deleteWith(await cookieOf(alex), comment.id);

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: { message: "You don't have permission to do that." } });
  expect(await stored(comment.id)).toBeDefined();
});

it("REQ-034.4: Sam is deactivated → Sam's comments show (deactivated), and an admin can still delete them", async () => {
  const { author, comment, displayId } = await onIssue({ fullName: "Sam Lee" });
  await db.update(members).set({ deactivatedAt: sql`now()` }).where(eq(members.id, author.id));
  const admin = await createMember({ role: "admin" });
  const adminCookie = await cookieOf(admin);

  const thread = await listIssueComments(
    new Request(`http://localhost:3000/api/issues/${displayId}/comments`, {
      headers: { Cookie: adminCookie },
    }),
    { params: Promise.resolve({ id: displayId }) },
  );
  expect((await thread.json())[0].author).toEqual({
    username: author.username,
    fullName: "Sam Lee",
    initials: "SL",
    deactivated: true,
  });

  expect((await deleteWith(adminCookie, comment.id)).status).toBe(204);
  expect(await stored(comment.id)).toBeUndefined();
});

it("REQ-013: editing or deleting a comment in an archived project gets This project is archived", async () => {
  const { author, project, comment } = await onIssue();
  const cookie = await cookieOf(author);
  await archive(project.id);

  for (const response of [
    await editWith(cookie, comment.id, { body: "Edited", version: 0 }),
    await deleteWith(cookie, comment.id),
  ]) {
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { message: "This project is archived" } });
  }
  expect(await stored(comment.id)).toMatchObject({ body: "Teh fix is ready" });
});

it("a project comment can be edited and deleted the same way", async () => {
  const author = await createMember();
  const project = await createProject();
  const comment = await createComment({ projectId: project.id }, author.id, "Kickoff");
  const cookie = await cookieOf(author);

  expect((await editWith(cookie, comment.id, { body: "Kickoff notes", version: 0 })).status).toBe(200);
  expect((await deleteWith(cookie, comment.id)).status).toBe(204);
});

it("deleting a comment that's gone, or an ID that isn't one, gets This comment was deleted", async () => {
  const cookie = await cookieOf(await createMember({ role: "admin" }));

  for (const id of [randomUUID(), "not-an-id"]) {
    const response = await deleteWith(cookie, id);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { message: "This comment was deleted" } });
  }
});