import type { ProjectSummary } from "../../../contract";
import { listProjects } from "../../../queries";
import { apiRoute } from "../../../server/shared/api-route";

export const GET = apiRoute("member", async (request, member) => {
  const archived = new URL(request.url).searchParams.get("archived") === "true";
  return Response.json((await listProjects(member, archived)) satisfies ProjectSummary[]);
});