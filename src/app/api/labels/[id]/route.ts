import type { Label } from "../../../../contract";
import { tryFrom, Uuid } from "../../../../domain/shared/identifiers";
import { deleteLabel, LabelChanges, updateLabel } from "../../../../server/projects";
import { apiRoute } from "../../../../server/shared/api-route";

export async function PATCH(request: Request, { params }: RouteContext<"/api/labels/[id]">) {
  const id = tryFrom(Uuid, (await params).id);
  return apiRoute("member", LabelChanges, async (_memberRequest, member, changes) =>
    Response.json((await updateLabel(member, id, changes)) satisfies Label),
  )(request);
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/labels/[id]">) {
  const id = tryFrom(Uuid, (await params).id);
  return apiRoute("member", async (_memberRequest, member) => {
    await deleteLabel(member, id);
    return new Response(null, { status: 204 });
  })(request);
}