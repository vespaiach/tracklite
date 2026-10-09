import "server-only";
import { asc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { ApiError } from "./api-error";
import { db } from "./db";
import { conflict, replaceMentions } from "./descriptions";
import { byIssueId, issueGone, uuidPattern } from "./issues";
import { memberSummary } from "./members";
import { notify } from "./notifications";
import { writableProject } from "./projects";
import { comments, issues, members, mentions, projects } from "./schema";
import type { Member } from "./sessions";
import type { CommentEdit, NewComment } from "../schemas/comment";
import type { ThreadComment } from "../contract";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Transaction;
type CommentParent = { issueId: string } | { projectId: string };

function commentGone() {
  return new ApiError(404, "This comment was deleted");
}

function notAllowed() {
  return new ApiError(403, "You don't have permission to do that.");
}

async function findComments(executor: Executor, where: SQL): Promise<ThreadComment[]> {
  const rows = await commentRows(executor, where);

  const mentioned = await mentionsOfComments(
    executor,
    rows.map((row) => row.id),
  );

  return rows.map(
    (row): ThreadComment => ({
      id: row.id,
      body: row.body,
      author: memberSummary(row.author),
      createdAt: row.createdAt.toISOString(),
      editedAt: row.editedAt?.toISOString() ?? null,
      version: row.version,
      mentions: mentioned.filter((mention) => mention.commentId === row.id).map(memberSummary),
    }),
  );
}

function commentRows(executor: Executor, where: SQL) {
  return executor
    .select({
      id: comments.id,
      body: comments.body,
      version: comments.version,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
      author: {
        username: members.username,
        fullName: members.fullName,
        deactivatedAt: members.deactivatedAt,
      },
    })
    .from(comments)
    .innerJoin(members, eq(members.id, comments.authorId))
    .where(where)
    .orderBy(asc(comments.createdAt), asc(comments.id));
}

async function mentionsOfComments(executor: Executor, commentIds: string[]) {
  if (commentIds.length === 0) return [];
  return executor
    .select({
      commentId: mentions.commentId,
      username: members.username,
      fullName: members.fullName,
      deactivatedAt: members.deactivatedAt,
    })
    .from(mentions)
    .innerJoin(members, eq(members.id, mentions.memberId))
    .where(inArray(mentions.commentId, commentIds))
    .orderBy(asc(members.username));
}

async function oneComment(executor: Executor, id: string) {
  const [comment] = await findComments(executor, eq(comments.id, id));
  if (!comment) throw commentGone();
  return comment;
}

async function issueOf(executor: Executor, id: string) {
  const where = byIssueId(id);
  if (!where) return undefined;
  const [issue] = await executor
    .select({ id: issues.id, projectKey: projects.key })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .where(where);
  return issue;
}

export async function listIssueComments(_actor: Member, id: string) {
  const issue = await issueOf(db, id);
  if (!issue) throw new ApiError(404, "Not found");
  return findComments(db, eq(comments.issueId, issue.id));
}

export async function listProjectComments(_actor: Member, key: string) {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.key, key.toUpperCase()));
  if (!project) throw new ApiError(404, "Not found");
  return findComments(db, eq(comments.projectId, project.id));
}

async function postComment(
  member: Member,
  { requestId, body: text }: NewComment,
  parentOf: (tx: Transaction) => Promise<CommentParent>,
) {
  return db.transaction(async (tx) => {
    const parent = await parentOf(tx);

    const [repeated] = await findComments(tx, eq(comments.requestId, requestId));
    if (repeated) return { comment: repeated, created: false };

    const [inserted] = await tx
      .insert(comments)
      .values({ ...parent, authorId: member.id, body: text, requestId })
      .returning({ id: comments.id });

    const mentioned = await replaceMentions(tx, { commentId: inserted.id }, text);

    await notify(tx, mentioned, {
      kind: "mentioned",
      actorId: member.id,
      target: parent,
      commentId: inserted.id,
      text,
    });

    return { comment: await oneComment(tx, inserted.id), created: true };
  });
}

export function postIssueComment(actor: Member, id: string, body: NewComment) {
  return postComment(actor, body, async (tx) => {
    const issue = await issueOf(tx, id);
    if (!issue) throw issueGone();

    await writableProject(tx, issue.projectKey);

    return { issueId: issue.id };
  });
}

export function postProjectComment(actor: Member, key: string, body: NewComment) {
  return postComment(actor, body, async (tx) => ({ projectId: (await writableProject(tx, key)).id }));
}

async function lockedComment(tx: Transaction, id: string) {
  if (!uuidPattern.test(id)) throw commentGone();

  const [target] = await tx
    .select({ id: comments.id, projectKey: projects.key })
    .from(comments)
    .leftJoin(issues, eq(issues.id, comments.issueId))
    .innerJoin(projects, eq(projects.id, sql`coalesce(${comments.projectId}, ${issues.projectId})`))
    .where(eq(comments.id, id));
  if (!target) throw commentGone();

  await writableProject(tx, target.projectKey);

  const [comment] = await tx.select().from(comments).where(eq(comments.id, target.id)).for("update");
  if (!comment) throw commentGone();
  return comment;
}

export async function editComment(actor: Member, id: string, { body, version }: CommentEdit) {
  return db.transaction(async (tx) => {
    const comment = await lockedComment(tx, id);

    if (comment.authorId !== actor.id) throw notAllowed();
    if (comment.version !== version) throw await conflict(tx, comment.authorId);

    await tx
      .update(comments)
      .set({ body, version: sql`${comments.version} + 1`, editedAt: sql`now()` })
      .where(eq(comments.id, comment.id));

    const mentioned = await replaceMentions(tx, { commentId: comment.id }, body);

    await notify(tx, mentioned, {
      kind: "mentioned",
      actorId: actor.id,
      target: parentOf(comment),
      commentId: comment.id,
      text: body,
    });

    return oneComment(tx, comment.id);
  });
}

function parentOf(comment: typeof comments.$inferSelect): CommentParent {
  return comment.issueId ? { issueId: comment.issueId } : { projectId: comment.projectId as string };
}

export async function deleteComment(actor: Member, id: string) {
  await db.transaction(async (tx) => {
    const comment = await lockedComment(tx, id);

    if (comment.authorId !== actor.id && actor.role !== "admin") throw notAllowed();

    await tx.delete(comments).where(eq(comments.id, comment.id));
  });
}