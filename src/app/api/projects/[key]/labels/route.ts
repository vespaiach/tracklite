import type { Label } from "../../../../../client/api";
import { NewLabel } from "../../../../../schemas/label";
import { apiRoute } from "../../../../../server/api-route";
import { createLabel, listLabels } from "../../../../../server/labels";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]/labels">) {
  const { key } = await params;
  return apiRoute("member", async () => Response.json((await listLabels(key)) satisfies Label[]))(request);
}

export async function POST(request: Request, { params }: RouteContext<"/api/projects/[key]/labels">) {
  const { key } = await params;
  return apiRoute("member", NewLabel, async (_memberRequest, _member, label) =>
    Response.json((await createLabel(key, label)) satisfies Label, { status: 201 }),
  )(request);
}