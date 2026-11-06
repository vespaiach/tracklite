import { deleteComment } from "../../../../application/comments/delete-comment";
import { editComment } from "../../../../application/comments/edit-comment";
import type { ThreadComment } from "../../../../contract";
import { tryFrom, Uuid } from "../../../../domain/shared/identifiers";
import { commentWork } from "../../../../infrastructure/comments/comment-work";
import { db } from "../../../../infrastructure/db";
import { updatedComment } from "../../../../queries";
import { apiRoute } from "../../_route";
import { CommentEdit } from "../../../_server/schemas/comments";

export async function PATCH(request: Request, { params }: RouteContext<"/api/comments/[id]">) {
  const id = tryFrom(Uuid, (await params).id);
  return apiRoute("member", CommentEdit, async (_memberRequest, member, edit) => {
    const commentId = await editComment(member, commentWork, id, edit);
    return Response.json((await updatedComment(db, commentId)) satisfies ThreadComment);
  })(request);
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/comments/[id]">) {
  const id = tryFrom(Uuid, (await params).id);
  return apiRoute("member", async (_memberRequest, member) => {
    await deleteComment(member, commentWork, id);
    return new Response(null, { status: 204 });
  })(request);
}