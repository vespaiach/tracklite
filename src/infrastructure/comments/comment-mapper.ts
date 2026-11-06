import { Comment, type CommentProps, parentOf } from "../../domain/comments/comment";
import type { comments } from "./tables";

export function toComment(row: typeof comments.$inferSelect) {
  return Comment.rehydrate({
    id: row.id,
    target: parentOf(row),
    authorId: row.authorId,
    body: row.body,
    version: row.version,
    requestId: row.requestId,
  });
}

export function toRow({ target, ...fields }: CommentProps) {
  return { ...fields, ...target };
}