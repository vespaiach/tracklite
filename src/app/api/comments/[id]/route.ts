import type { ThreadComment } from "../../../../client/api";
import { apiRoute } from "../../../../server/api-route";
import { deleteComment, editComment } from "../../../../server/comments";

export async function PATCH(request: Request, { params }: RouteContext<"/api/comments/[id]">) {
  const { id } = await params;
  return apiRoute("member", async (memberRequest, member) =>
    Response.json((await editComment(id, member, await memberRequest.json())) satisfies ThreadComment),
  )(request);
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/comments/[id]">) {
  const { id } = await params;
  return apiRoute("member", async (_memberRequest, member) => {
    await deleteComment(id, member);
    return new Response(null, { status: 204 });
  })(request);
}