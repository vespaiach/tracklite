import type { Project } from "../../../../contract";
import { ProjectKey, tryFrom } from "../../../../domain/shared/identifiers";
import { getProject } from "../../../../queries";
import { apiRoute } from "../../_route";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]">) {
  const key = tryFrom(ProjectKey, (await params).key);
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await getProject(member, key)) satisfies Project),
  )(request);
}