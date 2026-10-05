import type { Issue } from "../../../../client/api";
import { apiRoute } from "../../../../server/api-route";
import { deleteIssue, getIssue, updateIssue } from "../../../../server/issues";

export async function GET(request: Request, { params }: RouteContext<"/api/issues/[id]">) {
  const { id } = await params;
  return apiRoute("member", async () => Response.json((await getIssue(id)) satisfies Issue))(request);
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/issues/[id]">) {
  const { id } = await params;
  return apiRoute("member", async (memberRequest, member) => {
    const body: Record<string, unknown> = await memberRequest.json();
    return Response.json((await updateIssue(id, member, body)) satisfies Issue);
  })(request);
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/issues/[id]">) {
  const { id } = await params;
  return apiRoute("member", async (_memberRequest, member) => {
    await deleteIssue(id, member);
    return new Response(null, { status: 204 });
  })(request);
}