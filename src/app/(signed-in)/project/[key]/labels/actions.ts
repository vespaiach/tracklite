"use server";

import * as v from "valibot";
import { createLabel as create } from "../../../../../application/projects/create-label";
import { deleteLabel as remove } from "../../../../../application/projects/delete-label";
import { updateLabel as update } from "../../../../../application/projects/update-label";
import { projectWork } from "../../../../../infrastructure/projects/project-work";
import { action } from "../../../../_server/action";
import { LabelChanges, LabelRef, NewLabel, ProjectAddress } from "../../../../_server/schemas/projects";

export const createLabel = action(
  "createLabel",
  "member",
  v.object({ ...NewLabel.entries, key: ProjectAddress }),
  async (actor, { key, ...label }) => {
    await create(actor, projectWork, key, label);
    return null;
  },
);

export const updateLabel = action(
  "updateLabel",
  "member",
  v.object({ ...LabelChanges.entries, ...LabelRef.entries }),
  async (actor, { id, ...changes }) => {
    await update(actor, projectWork, id, changes);
    return null;
  },
);

export const deleteLabel = action("deleteLabel", "member", LabelRef, async (actor, { id }) => {
  await remove(actor, projectWork, id);
  return null;
});