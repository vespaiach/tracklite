import type { Issue } from "../../../../../client/api";
import { IssueMove } from "../../../../../schemas/issue";
import { apiRoute } from "../../../../../server/api-route";
import { moveIssue } from "../../../../../server/issues";

export async function PUT(request: Request, { params }: RouteContext<"/api/issues/[id]/position">) {
  const { id } = await params;
  return apiRoute("member", IssueMove, async (_memberRequest, member, move) =>
    Response.json((await moveIssue(member, id, move)) satisfies Issue),
  )(request);
}