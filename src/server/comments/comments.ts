import "server-only";
import { eq, sql } from "drizzle-orm";
import { DomainError } from "../shared/domain-error";
import { db } from "../shared/db";
import type { Uuid } from "../shared/ids";
import type { Executor, Transaction } from "../shared/transaction";
import { publish } from "../shared/events";
import { type IssueId, issues } from "../issues";
import { editConflict, type Member } from "../identity";
import { type ProjectKey, writableProject, projects } from "../projects";
import { findComments, issueGone, issueTarget } from "../queries";
import { comments } from "./tables";
import type { CommentEdit, NewComment } from "./schemas";
import { mayDeleteComment, parentOf } from "./rules";

type CommentParent = ReturnType<typeof parentOf>;

function commentGone() {
  return new DomainError("notFound", "This comment was deleted");
}

function notAllowed() {
  return new DomainError("forbidden", "You don't have permission to do that.");
}

async function oneComment(executor: Executor, id: string) {
  const [comment] = await findComments(executor, eq(comments.id, id));
  if (!comment) throw commentGone();
  return comment;
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

    await publish(tx, {
      type: "CommentPosted",
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
    const issue = await issueTarget(tx, id);
    if (!issue) throw issueGone();

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
    if (comment.version !== version) throw await editConflict(tx, comment.authorId);

    await tx
      .update(comments)
      .set({ body, version: sql`${comments.version} + 1`, editedAt: sql`now()` })
      .where(eq(comments.id, comment.id));

    await publish(tx, {
      type: "CommentEdited",
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