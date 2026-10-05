import type { Project, ProjectSummary } from "../../../client/api";
import { apiRoute } from "../../../server/api-route";
import { createProject, listProjects } from "../../../server/projects";

export const GET = apiRoute("member", async (request) => {
  const archived = new URL(request.url).searchParams.get("archived") === "true";
  return Response.json((await listProjects(archived)) satisfies ProjectSummary[]);
});

export const POST = apiRoute("admin", async (request) => {
  const body: { name?: unknown; key?: unknown } = await request.json();
  return Response.json((await createProject(body)) satisfies Project, { status: 201 });
});