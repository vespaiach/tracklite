"use server";

import * as v from "valibot";
import { postProjectComment } from "../../../../../application/comments/post-comment";
import { updateProject } from "../../../../../application/projects/update-project";
import { commentWork } from "../../../../../infrastructure/comments/comment-work";
import { projectWork } from "../../../../../infrastructure/projects/project-work";
import { action } from "../../../../_server/action";
import { NewComment } from "../../../../_server/schemas/comments";
import { ProjectAddress } from "../../../../_server/schemas/projects";
import { descriptionText, descriptionVersion } from "../../../../_server/schemas/shared";

export const saveDescription = action(
  "saveProjectDescription",
  "member",
  v.object({ key: ProjectAddress, description: descriptionText, descriptionVersion }),
  async (actor, { key, ...save }) => {
    await updateProject(actor, projectWork, key, save);
    return null;
  },
);

export const postComment = action(
  "postProjectComment",
  "member",
  v.object({ ...NewComment.entries, id: ProjectAddress }),
  async (actor, { id, ...comment }) => {
    await postProjectComment(actor, commentWork, id, comment);
    return null;
  },
);