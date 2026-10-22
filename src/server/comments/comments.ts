import "server-only";
import { asc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { ApiError } from "../shared/api-error";
import { db } from "../shared/db";
import type { Uuid } from "../shared/ids";
import type { Executor, Transaction } from "../shared/transaction";
import { conflict, notify, replaceMentions, mentions } from "../notifications";
import { type IssueId, issueGoneError, issueIdCondition, issues } from "../issues";
import { type Member, memberSummary, members } from "../identity";
import { byProjectKey, type ProjectKey, writableProject, projects } from "../projects";
import { comments } from "./tables";
import type { CommentEdit, NewComment } from "./schemas";
import type { ThreadComment } from "../../contract";
import { mayDeleteComment, parentOf } from "./rules";

type CommentParent = ReturnType<typeof parentOf>;

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

async function issueOf(executor: Executor, id: IssueId | undefined) {
  const where = issueIdCondition(id);
  if (!where) return undefined;
  const [issue] = await executor
    .select({ id: issues.id, projectKey: projects.key })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .where(where);
  return issue;
}

export async function listIssueComments(_actor: Member, id: IssueId | undefined) {
  const issue = await issueOf(db, id);
  if (!issue) throw new ApiError(404, "Not found");
  return findComments(db, eq(comments.issueId, issue.id));
}

export async function listProjectComments(_actor: Member, key: ProjectKey | undefined) {
  const [project] = await db.select({ id: projects.id }).from(projects).where(byProjectKey(key));
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

export function postIssueComment(actor: Member, id: IssueId | undefined, body: NewComment) {
  return postComment(actor, body, async (tx) => {
    const issue = await issueOf(tx, id);
    if (!issue) throw issueGoneError();

    await writableProject(tx, issue.projectKey);

    return { issueId: issue.id };
  });
}

export function postProjectComment(actor: Member, key: ProjectKey | undefined, body: NewComment) {
  return postComment(actor, body, async (tx) => ({ projectId: (await writableProject(tx, key)).id }));
}

async function lockedComment(tx: Transaction, id: Uuid | undefined) {
  if (id === undefined) throw commentGone();

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

export async function editComment(actor: Member, id: Uuid | undefined, { body, version }: CommentEdit) {
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

export async function deleteComment(actor: Member, id: Uuid | undefined) {
  await db.transaction(async (tx) => {
    const comment = await lockedComment(tx, id);

    if (!mayDeleteComment(actor, comment.authorId)) throw notAllowed();

    await tx.delete(comments).where(eq(comments.id, comment.id));
  });
}