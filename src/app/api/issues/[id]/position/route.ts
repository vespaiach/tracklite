import { moveIssue } from "../../../../../application/issues/move-issue";
import type { Issue } from "../../../../../contract";
import { IssueId, tryFrom } from "../../../../../domain/shared/identifiers";
import { db } from "../../../../../infrastructure/db";
import { issueWork } from "../../../../../infrastructure/issues/issue-work";
import { updatedIssue } from "../../../../../queries";
import { apiRoute } from "../../../_route";
import { IssueMove } from "../../../../_server/schemas/issues";

export async function PUT(request: Request, { params }: RouteContext<"/api/issues/[id]/position">) {
  const id = tryFrom(IssueId, (await params).id);
  return apiRoute("member", IssueMove, async (_memberRequest, member, move) => {
    const issueId = await moveIssue(member, issueWork, id, move);
    return Response.json((await updatedIssue(db, issueId)) satisfies Issue);
  })(request);
}