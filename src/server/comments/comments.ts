import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../shared/db";
import type { Uuid } from "../shared/ids";
import type { Executor, Transaction } from "../shared/transaction";
import { type EventTarget, publishAll } from "../shared/events";
import type { IssueId } from "../issues";
import { editConflict, type Member } from "../identity";
import { type ProjectKey, writableProject } from "../projects";
import { findComments, issueGone, issueTarget } from "../queries";
import { comments } from "./tables";
import type { CommentEdit, NewComment } from "./schemas";
import { edit, mayDeleteComment, newComment, notAllowed } from "./model";
import { commentGone, deleteCommentRow, loadComment, saveComment } from "./repository";

async function oneComment(executor: Executor, id: string) {
  const [comment] = await findComments(executor, eq(comments.id, id));
  if (!comment) throw commentGone();
  return comment;
}

async function postComment(
  actor: Member,
  { requestId, body }: NewComment,
  targetOf: (tx: Transaction) => Promise<EventTarget>,
) {
  return db.transaction(async (tx) => {
    const target = await targetOf(tx);

    const [repeated] = await findComments(tx, eq(comments.requestId, requestId));
    if (repeated) return { comment: repeated, created: false };

    const { comment, events } = newComment(actor, { id: randomUUID(), target, body, requestId });

    await saveComment(tx, null, comment);

    await publishAll(tx, events);

    return { comment: await oneComment(tx, comment.id), created: true };
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

export async function editComment(actor: Member, id: Uuid | undefined, { body, version }: CommentEdit) {
  return db.transaction(async (tx) => {
    const before = await loadComment(tx, id);

    const change = edit(before, actor, body, version);
    if ("conflictWith" in change) throw await editConflict(tx, change.conflictWith);

    await saveComment(tx, before, change.comment);

    await publishAll(tx, change.events);

    return oneComment(tx, change.comment.id);
  });
}

export async function deleteComment(actor: Member, id: Uuid | undefined) {
  await db.transaction(async (tx) => {
    const comment = await loadComment(tx, id);

    if (!mayDeleteComment(actor, comment.authorId)) throw notAllowed();

    await deleteCommentRow(tx, comment);
  });
}