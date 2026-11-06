import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../infrastructure/db";
import type { Transaction } from "../../../infrastructure/transaction";
import type { EventTarget } from "../../../domain/shared/events";
import { publishAll } from "../../../infrastructure/events";
import type { Member } from "../../identity";
import { writableProject } from "../../projects";
import { findComments, issueGone, issueTarget } from "../../../queries";
import { comments } from "../../../infrastructure/comments/tables";
import type { NewComment } from "../schemas";
import { newComment } from "../model";
import { oneComment, saveComment } from "../repository";
import { type IssueId, ProjectKey } from "../../../domain/shared/identifiers";

async function postComment(
  actor: Member,
  { requestId, body }: NewComment,
  targetOf: (tx: Transaction) => Promise<EventTarget>,
) {
  return db.transaction(async (tx) => {
    const target = await targetOf(tx);

    const [repeated] = await findComments(tx, eq(comments.requestId, requestId.value));
    if (repeated) return { comment: repeated, created: false };

    const { comment, events } = newComment(actor, {
      id: randomUUID(),
      target,
      body,
      requestId: requestId.value,
    });

    await saveComment(tx, null, comment);

    await publishAll(tx, events);

    return { comment: await oneComment(tx, comment.id), created: true };
  });
}

export function postIssueComment(actor: Member, id: IssueId | undefined, body: NewComment) {
  return postComment(actor, body, async (tx) => {
    const issue = await issueTarget(tx, id);
    if (!issue) throw issueGone();

    await writableProject(tx, ProjectKey.from(issue.projectKey));

    return { issueId: issue.id };
  });
}

export function postProjectComment(actor: Member, key: ProjectKey | undefined, body: NewComment) {
  return postComment(actor, body, async (tx) => ({ projectId: (await writableProject(tx, key)).id }));
}