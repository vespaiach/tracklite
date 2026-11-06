"use server";

import { createProject as create } from "../../application/projects/create-project";
import { projectWork } from "../../infrastructure/projects/project-work";
import { action } from "../_server/action";
import { NewProject } from "../_server/schemas/projects";

export const createProject = action("createProject", "member", NewProject, async (actor, project) => {
  await create(actor, projectWork, project);
  return { key: project.key.value };
});