import type { Project, ProjectSummary } from "../../../contract";
import { apiRoute } from "../../../server/api-route";
import { NewProject } from "../../../schemas/project";
import { createProject, listProjects } from "../../../server/projects";

export const GET = apiRoute("member", async (request, member) => {
  const archived = new URL(request.url).searchParams.get("archived") === "true";
  return Response.json((await listProjects(member, archived)) satisfies ProjectSummary[]);
});

export const POST = apiRoute("member", NewProject, async (_request, member, project) =>
  Response.json((await createProject(member, project)) satisfies Project, { status: 201 }),
);