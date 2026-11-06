"use server";

import * as v from "valibot";
import { deleteComment as removeComment } from "../../../../application/comments/delete-comment";
import { editComment as edit } from "../../../../application/comments/edit-comment";
import { postIssueComment } from "../../../../application/comments/post-comment";
import { deleteIssue as remove } from "../../../../application/issues/delete-issue";
import { updateIssue as update } from "../../../../application/issues/update-issue";
import { createLabel as addLabel } from "../../../../application/projects/create-label";
import { IssueId, ProjectKey, tryFrom, Uuid } from "../../../../domain/shared/identifiers";
import { commentWork } from "../../../../infrastructure/comments/comment-work";
import { db } from "../../../../infrastructure/db";
import { issueWork } from "../../../../infrastructure/issues/issue-work";
import { projectWork } from "../../../../infrastructure/projects/project-work";
import { updatedComment, updatedIssue, updatedLabel } from "../../../../queries";
import { action } from "../../../_server/action";
import { parseInput } from "../../../_server/parse-input";
import { CommentEdit, NewComment } from "../../../_server/schemas/comments";
import { IssueChange } from "../../../_server/schemas/issues";
import { NewLabel } from "../../../_server/schemas/projects";

const issueId = v.pipe(
  v.string(),
  v.transform((id) => tryFrom(IssueId, id)),
);

const commentId = v.pipe(
  v.string(),
  v.transform((id) => tryFrom(Uuid, id)),
);

const projectKey = v.pipe(
  v.string(),
  v.transform((key) => tryFrom(ProjectKey, key)),
);

export const updateIssue = action(
  "updateIssue",
  "member",
  v.looseObject({ id: issueId }),
  async (actor, { id, ...change }) => {
    const saved = await update(actor, issueWork, id, parseInput(IssueChange, change));
    return updatedIssue(db, saved);
  },
);

export const deleteIssue = action(
  "deleteIssue",
  "member",
  v.object({ id: issueId }),
  async (actor, { id }) => {
    await remove(actor, issueWork, id);
    return null;
  },
);

export const createLabel = action(
  "createLabel",
  "member",
  v.object({ ...NewLabel.entries, key: projectKey }),
  async (actor, { key, ...label }) => updatedLabel(db, await addLabel(actor, projectWork, key, label)),
);

export const postComment = action(
  "postComment",
  "member",
  v.object({ ...NewComment.entries, id: issueId }),
  async (actor, { id, ...comment }) => {
    const { commentId: posted } = await postIssueComment(actor, commentWork, id, comment);
    return updatedComment(db, posted);
  },
);

export const editComment = action(
  "editComment",
  "member",
  v.object({ ...CommentEdit.entries, id: commentId }),
  async (actor, { id, ...change }) => updatedComment(db, await edit(actor, commentWork, id, change)),
);

export const deleteComment = action(
  "deleteComment",
  "member",
  v.object({ id: commentId }),
  async (actor, { id }) => {
    await removeComment(actor, commentWork, id);
    return null;
  },
);