import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../../server/db";
import { comments, issues, mentions, projects } from "../../../../../server/schema";
import { createSession } from "../../../../../server/sessions";
import { createComment, createIssue, createMember, createProject } from "../../../../../test/factories";
import { jsonRequest } from "../../../../../test/reset-links";
import { moveIntoPast } from "../../../../../test/time";
import { GET, POST } from "./route";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function cookieOf(member: { id: string }) {
  return `session=${await createSession(member.id)}`;
}

async function issueIn(project: { id: string; key: string }) {
  const issue = await createIssue(project.id);
  return { ...issue, displayId: `${project.key}-${issue.number}` };
}

function listWith(cookie: string, id: string) {
  return GET(
    new Request(`http://localhost:3000/api/issues/${id}/comments`, { headers: { Cookie: cookie } }),
    {
      params: Promise.resolve({ id }),
    },
  );
}

function postWith(cookie: string, id: string, body: unknown) {
  return POST(jsonRequest("POST", `/api/issues/${id}/comments`, body, { Cookie: cookie }), {
    params: Promise.resolve({ id }),
  });
}

function storedComments(issueId: string) {
  return db.select().from(comments).where(eq(comments.issueId, issueId)).orderBy(asc(comments.createdAt));
}

it('REQ-031.1: Sam posts "Looks good. @alex can you review?" on WEB-42', async () => {
  const sam = await createMember({ fullName: "Sam Lee" });
  const alex = await createMember({ fullName: "Alex Kim" });
  const project = await createProject();
  const issue = await issueIn(project);
  const body = `Looks good. @${alex.username} can you review?`;

  const response = await postWith(await cookieOf(sam), issue.displayId, { requestId: randomUUID(), body });

  expect(response.status).toBe(201);
  const comment = await response.json();
  expect(comment).toEqual({
    id: expect.any(String),
    body,
    author: { username: sam.username, fullName: "Sam Lee", initials: "SL", deactivated: false },
    createdAt: expect.any(String),
    editedAt: null,
    version: 0,
    mentions: [{ username: alex.username, fullName: "Alex Kim", initials: "AK", deactivated: false }],
  });
  const rows = await db.select().from(mentions).where(eq(mentions.commentId, comment.id));
  expect(rows.map((row) => row.memberId)).toEqual([alex.id]);
});

it("REQ-031: an empty or all-spaces comment is refused", async () => {
  const cookie = await cookieOf(await createMember());
  const project = await createProject();
  const issue = await issueIn(project);

  for (const body of ["", "   \n  ", undefined]) {
    const response = await postWith(cookie, issue.displayId, { requestId: randomUUID(), body });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: { message: "Check the highlighted fields", fields: { body: "Comment required" } },
    });
  }
  expect(await storedComments(issue.id)).toEqual([]);
});

it('REQ-031.3: a comment of 10,001 characters gets "Too long (max 10,000)"', async () => {
  const cookie = await cookieOf(await createMember());
  const project = await createProject();
  const issue = await issueIn(project);

  const tooLong = await postWith(cookie, issue.displayId, {
    requestId: randomUUID(),
    body: "a".repeat(10_001),
  });
  expect(tooLong.status).toBe(422);
  expect((await tooLong.json()).error.fields).toEqual({ body: "Too long (max 10,000)" });

  const longest = await postWith(cookie, issue.displayId, {
    requestId: randomUUID(),
    body: "a".repeat(10_000),
  });
  expect(longest.status).toBe(201);
});

it("REQ-031: a comment is stored as sent, so an indented code block at the start survives", async () => {
  const cookie = await cookieOf(await createMember());
  const project = await createProject();
  const issue = await issueIn(project);
  const body = "    npm test\n\nThat fails for me.";

  const response = await postWith(cookie, issue.displayId, { requestId: randomUUID(), body });

  expect((await response.json()).body).toBe(body);
});

it("STD-5: posting again with the same requestId returns the original comment", async () => {
  const cookie = await cookieOf(await createMember());
  const project = await createProject();
  const issue = await issueIn(project);
  const requestId = randomUUID();

  const first = await postWith(cookie, issue.displayId, { requestId, body: "Once" });
  const again = await postWith(cookie, issue.displayId, { requestId, body: "Once" });

  expect(first.status).toBe(201);
  expect(again.status).toBe(200);
  expect((await again.json()).id).toBe((await first.json()).id);
  expect(await storedComments(issue.id)).toHaveLength(1);
});

it("STD-5: a post without a valid requestId is refused", async () => {
  const cookie = await cookieOf(await createMember());
  const project = await createProject();
  const issue = await issueIn(project);

  const response = await postWith(cookie, issue.displayId, { requestId: "not-a-uuid", body: "Hi" });

  expect(response.status).toBe(422);
  expect((await response.json()).error.fields).toEqual({ requestId: "Invalid request" });
});

it("DATA-001: comment mentions are active members only, outside code", async () => {
  const cookie = await cookieOf(await createMember());
  const sam = await createMember();
  const jo = await createMember({ deactivatedAt: new Date() });
  const coder = await createMember();
  const project = await createProject();
  const issue = await issueIn(project);
  const body = `(@${sam.username}) and @nobody-here, @${jo.username}, \`@${coder.username}\``;

  const response = await postWith(cookie, issue.displayId, { requestId: randomUUID(), body });

  const comment = await response.json();
  expect(comment.mentions.map((member: { username: string }) => member.username)).toEqual([sam.username]);
  const rows = await db.select().from(mentions).where(eq(mentions.commentId, comment.id));
  expect(rows.map((row) => row.memberId)).toEqual([sam.id]);
});

it("REQ-032.1: comments posted at 09:00 and 09:05 → the 09:00 comment is first", async () => {
  const author = await createMember();
  const project = await createProject();
  const issue = await issueIn(project);
  const later = await createComment({ issueId: issue.id }, author.id, "09:05");
  const earlier = await createComment({ issueId: issue.id }, author.id, "09:00");
  await moveIntoPast(comments.createdAt, later.id, "1 hour");
  await moveIntoPast(comments.createdAt, earlier.id, "1 hour 5 minutes");

  const response = await listWith(await cookieOf(author), issue.displayId);

  expect(response.status).toBe(200);
  expect((await response.json()).map((comment: { body: string }) => comment.body)).toEqual([
    "09:00",
    "09:05",
  ]);
});

it("REQ-032.4: WEB-42 has 200 comments → all 200 are returned", async () => {
  const author = await createMember();
  const project = await createProject();
  const issue = await issueIn(project);
  await db.insert(comments).values(
    Array.from({ length: 200 }, (_, index) => ({
      issueId: issue.id,
      authorId: author.id,
      body: `Comment ${index}`,
      requestId: randomUUID(),
    })),
  );

  const response = await listWith(await cookieOf(author), issue.displayId);

  expect(await response.json()).toHaveLength(200);
});

it("REQ-032.3: an archived project's issue threads still load, but posting gets This project is archived", async () => {
  const author = await createMember();
  const cookie = await cookieOf(author);
  const project = await createProject();
  const issue = await issueIn(project);
  await createComment({ issueId: issue.id }, author.id, "Before archiving");
  await db.update(projects).set({ archivedAt: sql`now()` }).where(eq(projects.id, project.id));

  const list = await listWith(cookie, issue.displayId);
  expect(list.status).toBe(200);
  expect((await list.json()).map((comment: { body: string }) => comment.body)).toEqual(["Before archiving"]);

  const post = await postWith(cookie, issue.displayId, { requestId: randomUUID(), body: "After" });
  expect(post.status).toBe(403);
  expect(await post.json()).toEqual({ error: { message: "This project is archived" } });
  expect(await storedComments(issue.id)).toHaveLength(1);
});

it("posting on a deleted issue gets This issue was deleted, and listing it gets Not found", async () => {
  const cookie = await cookieOf(await createMember());
  const project = await createProject();
  const issue = await issueIn(project);
  await db.delete(issues).where(eq(issues.id, issue.id));

  const post = await postWith(cookie, issue.displayId, { requestId: randomUUID(), body: "Hello?" });
  expect(post.status).toBe(404);
  expect(await post.json()).toEqual({ error: { message: "This issue was deleted" } });

  const list = await listWith(cookie, issue.displayId);
  expect(list.status).toBe(404);
});