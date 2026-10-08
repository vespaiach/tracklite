import type { Project, ProjectSummary } from "../../../client/api";
import { apiRoute } from "../../../server/api-route";
import { createProject, listProjects, NewProject } from "../../../server/projects";

export const GET = apiRoute("member", async (request) => {
  const archived = new URL(request.url).searchParams.get("archived") === "true";
  return Response.json((await listProjects(archived)) satisfies ProjectSummary[]);
});

export const POST = apiRoute("admin", NewProject, async (_request, _member, project) =>
  Response.json((await createProject(project)) satisfies Project, { status: 201 }),
);