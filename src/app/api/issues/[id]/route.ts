import type { Issue } from "../../../../contract";
import { apiRoute } from "../../../../server/shared/api-route";
import { deleteIssue, getIssue, IssueChange, parseIssueId, updateIssue } from "../../../../server/issues";

export async function GET(request: Request, { params }: RouteContext<"/api/issues/[id]">) {
  const id = parseIssueId((await params).id);
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await getIssue(member, id)) satisfies Issue),
  )(request);
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/issues/[id]">) {
  const id = parseIssueId((await params).id);
  return apiRoute("member", IssueChange, async (_memberRequest, member, change) =>
    Response.json((await updateIssue(member, id, change)) satisfies Issue),
  )(request);
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/issues/[id]">) {
  const id = parseIssueId((await params).id);
  return apiRoute("member", async (_memberRequest, member) => {
    await deleteIssue(member, id);
    return new Response(null, { status: 204 });
  })(request);
}