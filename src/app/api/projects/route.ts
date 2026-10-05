import { apiRoute } from "../../../server/api-route";
import { createProject, listProjects } from "../../../server/projects";

export const GET = apiRoute("member", async (request) => {
  const archived = new URL(request.url).searchParams.get("archived") === "true";
  return Response.json(await listProjects(archived));
});

export const POST = apiRoute("admin", async (request) => {
  const body: { name?: unknown; key?: unknown } = await request.json();
  return Response.json(await createProject(body), { status: 201 });
});