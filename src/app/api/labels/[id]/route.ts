import { deleteLabel } from "../../../../application/projects/delete-label";
import { updateLabel } from "../../../../application/projects/update-label";
import type { Label } from "../../../../contract";
import { tryFrom, Uuid } from "../../../../domain/shared/identifiers";
import { db } from "../../../../infrastructure/db";
import { projectWork } from "../../../../infrastructure/projects/project-work";
import { updatedLabel } from "../../../../queries";
import { apiRoute } from "../../_route";
import { LabelChanges } from "../../../_server/schemas/projects";

export async function PATCH(request: Request, { params }: RouteContext<"/api/labels/[id]">) {
  const id = tryFrom(Uuid, (await params).id);
  return apiRoute("member", LabelChanges, async (_memberRequest, member, changes) => {
    const labelId = await updateLabel(member, projectWork, id, changes);
    return Response.json((await updatedLabel(db, labelId)) satisfies Label);
  })(request);
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/labels/[id]">) {
  const id = tryFrom(Uuid, (await params).id);
  return apiRoute("member", async (_memberRequest, member) => {
    await deleteLabel(member, projectWork, id);
    return new Response(null, { status: 204 });
  })(request);
}