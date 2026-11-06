import type { ProjectSummary } from "../../../contract";
import { listProjects } from "../../../queries";
import { apiRoute } from "../_route";

export const GET = apiRoute("member", async (request, member) => {
  const archived = new URL(request.url).searchParams.get("archived") === "true";
  return Response.json((await listProjects(member, archived)) satisfies ProjectSummary[]);
});