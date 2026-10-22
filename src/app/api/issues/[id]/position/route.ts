import type { Issue } from "../../../../../contract";
import { apiRoute } from "../../../../../server/shared/api-route";
import { IssueMove, moveIssue, parseIssueId } from "../../../../../server/issues";

export async function PUT(request: Request, { params }: RouteContext<"/api/issues/[id]/position">) {
  const id = parseIssueId((await params).id);
  return apiRoute("member", IssueMove, async (_memberRequest, member, move) =>
    Response.json((await moveIssue(member, id, move)) satisfies Issue),
  )(request);
}