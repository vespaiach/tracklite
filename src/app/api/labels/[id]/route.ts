import { apiRoute } from "../../../../server/api-route";
import { deleteLabel, updateLabel } from "../../../../server/labels";

export async function PATCH(request: Request, { params }: RouteContext<"/api/labels/[id]">) {
  const { id } = await params;
  return apiRoute("member", async (memberRequest) => {
    const body: { name?: unknown; color?: unknown } = await memberRequest.json();
    return Response.json(await updateLabel(id, body));
  })(request);
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/labels/[id]">) {
  const { id } = await params;
  return apiRoute("member", async () => {
    await deleteLabel(id);
    return new Response(null, { status: 204 });
  })(request);
}