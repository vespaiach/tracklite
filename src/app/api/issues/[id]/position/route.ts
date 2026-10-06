import type { Issue } from "../../../../../client/api";
import { apiRoute } from "../../../../../server/api-route";
import { moveIssue } from "../../../../../server/issues";

export async function PUT(request: Request, { params }: RouteContext<"/api/issues/[id]/position">) {
  const { id } = await params;
  return apiRoute("member", async (memberRequest) => {
    const body: Record<string, unknown> = await memberRequest.json();
    return Response.json((await moveIssue(id, body)) satisfies Issue);
  })(request);
}