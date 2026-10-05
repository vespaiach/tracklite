import { apiRoute } from "../../../../server/api-route";
import { getIssue, updateIssue } from "../../../../server/issues";

export async function GET(request: Request, { params }: RouteContext<"/api/issues/[id]">) {
  const { id } = await params;
  return apiRoute("member", async () => Response.json(await getIssue(id)))(request);
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/issues/[id]">) {
  const { id } = await params;
  return apiRoute("member", async (memberRequest) => {
    const body: Record<string, unknown> = await memberRequest.json();
    return Response.json(await updateIssue(id, body));
  })(request);
}