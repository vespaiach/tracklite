"use client";

import { CommentThread, type CommentThreadProps } from "../../../../../client/CommentThread";
import type { ActionResult } from "../../../../../contract";

type Saved = Promise<ActionResult<null>>;

export type ProjectCommentsProps = Omit<
  CommentThreadProps,
  "postComment" | "editComment" | "deleteComment"
> & {
  projectKey: string;
  postComment: (comment: { key: string; requestId: string; body: string }) => Saved;
  editComment: (change: { id: string; body: string; version: number }) => Saved;
  deleteComment: (comment: { id: string }) => Saved;
};

export function ProjectComments({ projectKey, postComment, deleteComment, ...thread }: ProjectCommentsProps) {
  return (
    <CommentThread
      {...thread}
      postComment={(comment) => postComment({ key: projectKey, ...comment })}
      deleteComment={(id) => deleteComment({ id })}
    />
  );
}