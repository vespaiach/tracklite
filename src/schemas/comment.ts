import "server-only";
import * as v from "valibot";
import { maxCharacters, requestId, version } from "./common";

const commentBody = v.pipe(
  v.string("Comment required"),
  v.check((text) => text.trim() !== "", "Comment required"),
  maxCharacters(10_000, "Too long (max 10,000)"),
);

export const NewComment = v.object({ requestId, body: commentBody });
export type NewComment = v.InferOutput<typeof NewComment>;

export const CommentEdit = v.object({ body: commentBody, version });
export type CommentEdit = v.InferOutput<typeof CommentEdit>;