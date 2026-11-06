import { createLabel } from "../../../../../application/projects/create-label";
import type { Label } from "../../../../../contract";
import { ProjectKey, tryFrom } from "../../../../../domain/shared/identifiers";
import { db } from "../../../../../infrastructure/db";
import { projectWork } from "../../../../../infrastructure/projects/project-work";
import { listLabels, updatedLabel } from "../../../../../queries";
import { apiRoute } from "../../../_route";
import { NewLabel } from "../../../../_server/schemas/projects";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]/labels">) {
  const key = tryFrom(ProjectKey, (await params).key);
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await listLabels(member, key)) satisfies Label[]),
  )(request);
}

export async function POST(request: Request, { params }: RouteContext<"/api/projects/[key]/labels">) {
  const key = tryFrom(ProjectKey, (await params).key);
  return apiRoute("member", NewLabel, async (_memberRequest, member, label) => {
    const labelId = await createLabel(member, projectWork, key, label);
    return Response.json((await updatedLabel(db, labelId)) satisfies Label, { status: 201 });
  })(request);
}