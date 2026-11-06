import type { Label } from "../../../../../contract";
import { ProjectKey, tryFrom } from "../../../../../domain/shared/identifiers";
import { createLabel, NewLabel } from "../../../../../server/projects";
import { listLabels } from "../../../../../queries";
import { apiRoute } from "../../../../../server/shared/api-route";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]/labels">) {
  const key = tryFrom(ProjectKey, (await params).key);
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await listLabels(member, key)) satisfies Label[]),
  )(request);
}

export async function POST(request: Request, { params }: RouteContext<"/api/projects/[key]/labels">) {
  const key = tryFrom(ProjectKey, (await params).key);
  return apiRoute("member", NewLabel, async (_memberRequest, member, label) =>
    Response.json((await createLabel(member, key, label)) satisfies Label, { status: 201 }),
  )(request);
}