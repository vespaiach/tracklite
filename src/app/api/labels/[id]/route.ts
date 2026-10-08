import type { Label } from "../../../../client/api";
import { LabelChanges } from "../../../../schemas/label";
import { apiRoute } from "../../../../server/api-route";
import { deleteLabel, updateLabel } from "../../../../server/labels";

export async function PATCH(request: Request, { params }: RouteContext<"/api/labels/[id]">) {
  const { id } = await params;
  return apiRoute("member", LabelChanges, async (_memberRequest, _member, changes) =>
    Response.json((await updateLabel(id, changes)) satisfies Label),
  )(request);
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/labels/[id]">) {
  const { id } = await params;
  return apiRoute("member", async () => {
    await deleteLabel(id);
    return new Response(null, { status: 204 });
  })(request);
}