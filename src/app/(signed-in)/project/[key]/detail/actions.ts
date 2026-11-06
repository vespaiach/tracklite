"use server";

import * as v from "valibot";
import { deleteComment as remove } from "../../../../../application/comments/delete-comment";
import { editComment as edit } from "../../../../../application/comments/edit-comment";
import { postProjectComment } from "../../../../../application/comments/post-comment";
import { updateProject } from "../../../../../application/projects/update-project";
import { ProjectKey, tryFrom, Uuid } from "../../../../../domain/shared/identifiers";
import { commentWork } from "../../../../../infrastructure/comments/comment-work";
import { projectWork } from "../../../../../infrastructure/projects/project-work";
import { action } from "../../../../_server/action";
import { CommentEdit, NewComment } from "../../../../_server/schemas/comments";
import { descriptionText, descriptionVersion } from "../../../../_server/schemas/shared";

const projectKey = v.pipe(
  v.string(),
  v.transform((key) => tryFrom(ProjectKey, key)),
);

const commentId = v.pipe(
  v.string(),
  v.transform((id) => tryFrom(Uuid, id)),
);

export const saveDescription = action(
  "saveProjectDescription",
  "member",
  v.object({ key: projectKey, description: descriptionText, descriptionVersion }),
  async (actor, { key, ...save }) => {
    await updateProject(actor, projectWork, key, save);
    return null;
  },
);

export const postComment = action(
  "postProjectComment",
  "member",
  v.object({ ...NewComment.entries, key: projectKey }),
  async (actor, { key, ...comment }) => {
    await postProjectComment(actor, commentWork, key, comment);
    return null;
  },
);

export const editComment = action(
  "editComment",
  "member",
  v.object({ ...CommentEdit.entries, id: commentId }),
  async (actor, { id, ...change }) => {
    await edit(actor, commentWork, id, change);
    return null;
  },
);

export const deleteComment = action(
  "deleteComment",
  "member",
  v.object({ id: commentId }),
  async (actor, { id }) => {
    await remove(actor, commentWork, id);
    return null;
  },
);