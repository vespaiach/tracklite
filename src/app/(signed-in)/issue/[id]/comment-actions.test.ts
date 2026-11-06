import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { expect, it } from "vitest";
import { IssueId } from "../../../../domain/shared/identifiers";
import { comments } from "../../../../infrastructure/comments/tables";
import { db } from "../../../../infrastructure/db";
import { createSession, sessionCookieName } from "../../../../infrastructure/identity/session";
import { type Member, members } from "../../../../infrastructure/identity/tables";
import { mentions } from "../../../../infrastructure/notifications/tables";
import { projects } from "../../../../infrastructure/projects/tables";
import { listIssueComments } from "../../../../queries";
import { createComment, createIssue, createMember, createProject } from "../../../../test/factories";
import { setNextRequest } from "../../../../test/next-request";
import { deleteComment, editComment } from "./actions";

async function signInAs(member: Member) {
  setNextRequest({ cookies: { [sessionCookieName()]: await createSession(member.id) } });
}

function refusal(kind: string, message: string) {
  return { ok: false, error: { kind, message } };
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

async function mentionedIds(commentId: string) {
  const rows = await db.select().from(mentions).where(eq(mentions.commentId, commentId));
  return rows.map((row) => row.memberId);
}

it("REQ-033.1, DATA-001: Sam fixes a typo in their comment → saved and marked edited, the mention rows follow the current text, and the page is refreshed", async () => {
  const { author, comment } = await onIssue({ fullName: "Sam Lee" });
  const alex = await createMember();
  await signInAs(author);

  const result = await editComment({
    id: comment.id,
    body: `The fix is ready, @${alex.username}`,
    version: 0,
  });

  expect(result).toMatchObject({
    ok: true,
    data: {
      id: comment.id,
      body: `The fix is ready, @${alex.username}`,
      editedAt: expect.any(String),
      version: 1,
      mentions: [{ username: alex.username }],
    },
  });
  expect(refresh).toHaveBeenCalledOnce();
  expect(await mentionedIds(comment.id)).toEqual([alex.id]);

  const jo = await createMember();
  await editComment({ id: comment.id, body: `Hi @${jo.username}`, version: 1 });
  expect(await mentionedIds(comment.id)).toEqual([jo.id]);
});

it("REQ-033.2, REQ-034.3: an admin can't edit Sam's comment, and Alex, a member, can't delete it", async () => {
  const { comment } = await onIssue();
  const forbidden = refusal("forbidden", "You don't have permission to do that.");

  await signInAs(await createMember({ role: "admin" }));
  expect(await editComment({ id: comment.id, body: "Admin words", version: 0 })).toEqual(forbidden);
  await signInAs(await createMember());
  expect(await deleteComment({ id: comment.id })).toEqual(forbidden);

  expect((await stored(comment.id)).body).toBe("Teh fix is ready");
});

it("REQ-033.3, STD-4: Sam saves an edit just after an admin deleted that comment, or anyone deletes a comment that's gone or an ID that isn't one → This comment was deleted", async () => {
  const { author, comment } = await onIssue();
  const admin = await createMember({ role: "admin" });
  const gone = refusal("notFound", "This comment was deleted");
  await signInAs(admin);
  expect(await deleteComment({ id: comment.id })).toEqual({ ok: true, data: null });

  expect(await deleteComment({ id: comment.id })).toEqual(gone);
  expect(await deleteComment({ id: randomUUID() })).toEqual(gone);
  expect(await deleteComment({ id: "not-an-id" })).toEqual(gone);
  await signInAs(author);
  expect(await editComment({ id: comment.id, body: "The fix", version: 0 })).toEqual(gone);
});

it("STD-8: a stale comment edit is refused naming who saved, and nothing is saved", async () => {
  const { author, comment } = await onIssue({ fullName: "Sam Lee" });
  await signInAs(author);

  expect((await editComment({ id: comment.id, body: "From the first tab", version: 0 })).ok).toBe(true);
  const stale = await editComment({ id: comment.id, body: "From the second tab", version: 0 });

  expect(stale).toEqual(refusal("conflict", "This was changed by Sam Lee. Copy your text and reload."));
  expect(await stored(comment.id)).toMatchObject({ body: "From the first tab", version: 1 });
});

it("REQ-033: an edit has the same limits as a new comment, and needs a whole-number version", async () => {
  const { author, comment } = await onIssue();
  await signInAs(author);

  const cases: [Record<string, unknown>, Record<string, string>][] = [
    [{ body: "  ", version: 0 }, { body: "Comment required" }],
    [{ body: "a".repeat(10_001), version: 0 }, { body: "Too long (max 10,000)" }],
    [{ body: "Fine", version: "0" }, { version: "Version required" }],
  ];
  for (const [input, fields] of cases) {
    expect(await editComment({ id: comment.id, ...input })).toMatchObject({
      ok: false,
      error: { kind: "invalid", fields },
    });
  }
  expect(await stored(comment.id)).toMatchObject({ body: "Teh fix is ready", version: 0, editedAt: null });
});

it("REQ-034.1: Sam deletes their own comment → it's gone for everyone, with its mentions", async () => {
  const { author, comment, displayId } = await onIssue();
  const alex = await createMember();
  await signInAs(author);
  await editComment({ id: comment.id, body: `@${alex.username}`, version: 0 });

  expect(await deleteComment({ id: comment.id })).toEqual({ ok: true, data: null });

  expect(await stored(comment.id)).toBeUndefined();
  expect(await mentionedIds(comment.id)).toEqual([]);
  expect(await listIssueComments(alex, IssueId.from(displayId))).toEqual([]);
});

it("REQ-034.4, REQ-034.2: Sam is deactivated → Sam's comments show (deactivated), and an admin can still delete them", async () => {
  const { author, comment, displayId } = await onIssue({ fullName: "Sam Lee" });
  await db.update(members).set({ deactivatedAt: sql`now()` }).where(eq(members.id, author.id));
  const admin = await createMember({ role: "admin" });

  const thread = await listIssueComments(admin, IssueId.from(displayId));
  expect(thread[0].author).toEqual({
    username: author.username,
    fullName: "Sam Lee",
    initials: "SL",
    deactivated: true,
  });

  await signInAs(admin);
  expect(await deleteComment({ id: comment.id })).toEqual({ ok: true, data: null });
  expect(await stored(comment.id)).toBeUndefined();
});

it("REQ-013: editing or deleting a comment in an archived project gets This project is archived", async () => {
  const { author, project, comment } = await onIssue();
  await db.update(projects).set({ archivedAt: sql`now()` }).where(eq(projects.id, project.id));
  await signInAs(author);
  const archived = refusal("forbidden", "This project is archived");

  expect(await editComment({ id: comment.id, body: "Edited", version: 0 })).toEqual(archived);
  expect(await deleteComment({ id: comment.id })).toEqual(archived);
  expect(await stored(comment.id)).toMatchObject({ body: "Teh fix is ready" });
});

it("REQ-033, REQ-034: a project comment is edited and deleted the same way", async () => {
  const author = await createMember();
  const project = await createProject();
  const comment = await createComment({ projectId: project.id }, author.id, "Kickoff");
  await signInAs(author);

  expect((await editComment({ id: comment.id, body: "Kickoff notes", version: 0 })).ok).toBe(true);
  expect(await deleteComment({ id: comment.id })).toEqual({ ok: true, data: null });
});