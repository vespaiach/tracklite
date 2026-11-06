import { deleteIssue } from "../../../../application/issues/delete-issue";
import { updateIssue } from "../../../../application/issues/update-issue";
import type { Issue } from "../../../../contract";
import { IssueId, tryFrom } from "../../../../domain/shared/identifiers";
import { db } from "../../../../infrastructure/db";
import { issueWork } from "../../../../infrastructure/issues/issue-work";
import { getIssue, updatedIssue } from "../../../../queries";
import { apiRoute } from "../../_route";
import { IssueChange } from "../../../_server/schemas/issues";

export async function GET(request: Request, { params }: RouteContext<"/api/issues/[id]">) {
  const id = tryFrom(IssueId, (await params).id);
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await getIssue(member, id)) satisfies Issue),
  )(request);
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/issues/[id]">) {
  const id = tryFrom(IssueId, (await params).id);
  return apiRoute("member", IssueChange, async (_memberRequest, member, change) => {
    const issueId = await updateIssue(member, issueWork, id, change);
    return Response.json((await updatedIssue(db, issueId)) satisfies Issue);
  })(request);
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/issues/[id]">) {
  const id = tryFrom(IssueId, (await params).id);
  return apiRoute("member", async (_memberRequest, member) => {
    await deleteIssue(member, issueWork, id);
    return new Response(null, { status: 204 });
  })(request);
}