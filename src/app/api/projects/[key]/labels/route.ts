import type { Label } from "../../../../../contract";
import { ProjectKey, tryFrom } from "../../../../../domain/shared/identifiers";
import { listLabels } from "../../../../../queries";
import { apiRoute } from "../../../_route";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]/labels">) {
  const key = tryFrom(ProjectKey, (await params).key);
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await listLabels(member, key)) satisfies Label[]),
  )(request);
}