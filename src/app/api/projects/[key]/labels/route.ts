import { apiRoute } from "../../../../../server/api-route";
import { createLabel, listLabels } from "../../../../../server/labels";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]/labels">) {
  const { key } = await params;
  return apiRoute("member", async () => Response.json(await listLabels(key)))(request);
}

export async function POST(request: Request, { params }: RouteContext<"/api/projects/[key]/labels">) {
  const { key } = await params;
  return apiRoute("member", async (memberRequest) => {
    const body: { name?: unknown; color?: unknown } = await memberRequest.json();
    return Response.json(await createLabel(key, body), { status: 201 });
  })(request);
}