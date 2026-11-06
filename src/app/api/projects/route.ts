import { createProject } from "../../../application/projects/create-project";
import type { Project, ProjectSummary } from "../../../contract";
import { db } from "../../../infrastructure/db";
import { projectWork } from "../../../infrastructure/projects/project-work";
import { listProjects, updatedProject } from "../../../queries";
import { apiRoute } from "../_route";
import { NewProject } from "../../_server/schemas/projects";

export const GET = apiRoute("member", async (request, member) => {
  const archived = new URL(request.url).searchParams.get("archived") === "true";
  return Response.json((await listProjects(member, archived)) satisfies ProjectSummary[]);
});

export const POST = apiRoute("member", NewProject, async (_request, member, newProject) => {
  const projectId = await createProject(member, projectWork, newProject);
  return Response.json((await updatedProject(db, projectId)) satisfies Project, { status: 201 });
});