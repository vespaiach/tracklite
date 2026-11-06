"use server";

import { deleteProject as remove } from "../../../../../application/projects/delete-project";
import { updateProject } from "../../../../../application/projects/update-project";
import { projectWork } from "../../../../../infrastructure/projects/project-work";
import { action } from "../../../../_server/action";
import { ProjectArchiving, ProjectRef, ProjectRename } from "../../../../_server/schemas/projects";

export const renameProject = action(
  "renameProject",
  "member",
  ProjectRename,
  async (actor, { key, name }) => {
    await updateProject(actor, projectWork, key, { name });
    return { name: name.value };
  },
);

export const archiveProject = action(
  "archiveProject",
  "member",
  ProjectArchiving,
  async (actor, { key, archived }) => {
    await updateProject(actor, projectWork, key, { archived });
    return null;
  },
);

export const deleteProject = action("deleteProject", "member", ProjectRef, async (actor, { key }) => {
  await remove(actor, projectWork, key);
  return null;
});