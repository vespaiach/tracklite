import { DomainError } from "../shared/domain-error";
import type { DomainEvent, EventTarget } from "../shared/events";
import type { Member } from "../identity";

export type Comment = Readonly<{
  id: string;
  target: EventTarget;
  authorId: string;
  body: string;
  version: number;
  requestId: string;
}>;

export type CommentChangeResult = { comment: Comment; events: DomainEvent[] };

type NewCommentFields = Pick<Comment, "id" | "target" | "body" | "requestId">;

export function notAllowed() {
  return new DomainError("forbidden", "You don't have permission to do that.");
}

export function parentOf(comment: { issueId: string | null; projectId: string | null }): EventTarget {
  return comment.issueId ? { issueId: comment.issueId } : { projectId: comment.projectId as string };
}

export function newComment(
  actor: Pick<Member, "id">,
  { id, target, body, requestId }: NewCommentFields,
): CommentChangeResult {
  return {
    comment: { id, target, authorId: actor.id, body, version: 0, requestId },
    events: [{ type: "CommentPosted", actorId: actor.id, target, commentId: id, text: body }],
  };
}

export function edit(
  comment: Comment,
  actor: Pick<Member, "id">,
  body: string,
  version: number,
): CommentChangeResult | { conflictWith: string } {
  if (comment.authorId !== actor.id) throw notAllowed();
  if (comment.version !== version) return { conflictWith: comment.authorId };

  return {
    comment: { ...comment, body, version: version + 1 },
    events: [
      { type: "CommentEdited", actorId: actor.id, target: comment.target, commentId: comment.id, text: body },
    ],
  };
}

export function mayDeleteComment(actor: Pick<Member, "id" | "role">, authorId: string) {
  return authorId === actor.id || actor.role === "admin";
}