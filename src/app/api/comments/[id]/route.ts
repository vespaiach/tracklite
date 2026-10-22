import type { ThreadComment } from "../../../../contract";
import { apiRoute } from "../../../../server/shared/api-route";
import { parseUuid } from "../../../../server/shared/ids";
import { CommentEdit, deleteComment, editComment } from "../../../../server/comments";

export async function PATCH(request: Request, { params }: RouteContext<"/api/comments/[id]">) {
  const id = parseUuid((await params).id);
  return apiRoute("member", CommentEdit, async (_memberRequest, member, edit) =>
    Response.json((await editComment(member, id, edit)) satisfies ThreadComment),
  )(request);
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/comments/[id]">) {
  const id = parseUuid((await params).id);
  return apiRoute("member", async (_memberRequest, member) => {
    await deleteComment(member, id);
    return new Response(null, { status: 204 });
  })(request);
}