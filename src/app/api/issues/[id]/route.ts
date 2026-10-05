import { apiRoute } from "../../../../server/api-route";
import { getIssue } from "../../../../server/issues";

export async function GET(request: Request, { params }: RouteContext<"/api/issues/[id]">) {
  const { id } = await params;
  return apiRoute("member", async () => Response.json(await getIssue(id)))(request);
}