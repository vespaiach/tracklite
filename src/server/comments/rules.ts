import type { Member } from "../identity";

type CommentParent = { issueId: string } | { projectId: string };

export function mayDeleteComment(actor: Pick<Member, "id" | "role">, authorId: string) {
  return authorId === actor.id || actor.role === "admin";
}

export function parentOf(comment: { issueId: string | null; projectId: string | null }): CommentParent {
  return comment.issueId ? { issueId: comment.issueId } : { projectId: comment.projectId as string };
}