import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../shared/db";
import type { Transaction } from "../../shared/transaction";
import { type EventTarget, publishAll } from "../../shared/events";
import type { IssueId } from "../../issues";
import type { Member } from "../../identity";
import { type ProjectKey, writableProject } from "../../projects";
import { findComments, issueGone, issueTarget } from "../../queries";
import { comments } from "../tables";
import type { NewComment } from "../schemas";
import { newComment } from "../model";
import { oneComment, saveComment } from "../repository";

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