import type { Issue } from "../../../../../contract";
import { IssueId, tryFrom } from "../../../../../domain/shared/identifiers";
import { apiRoute } from "../../../../../server/shared/api-route";
import { IssueMove, moveIssue } from "../../../../../server/issues";

export async function PUT(request: Request, { params }: RouteContext<"/api/issues/[id]/position">) {
  const id = tryFrom(IssueId, (await params).id);
  return apiRoute("member", IssueMove, async (_memberRequest, member, move) =>
    Response.json((await moveIssue(member, id, move)) satisfies Issue),
  )(request);
}