import { postProjectComment } from "../../../../../application/comments/post-comment";
import type { ThreadComment } from "../../../../../contract";
import { ProjectKey, tryFrom } from "../../../../../domain/shared/identifiers";
import { commentWork } from "../../../../../infrastructure/comments/comment-work";
import { db } from "../../../../../infrastructure/db";
import { listProjectComments, updatedComment } from "../../../../../queries";
import { apiRoute } from "../../../_route";
import { NewComment } from "../../../../_server/schemas/comments";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]/comments">) {
  const key = tryFrom(ProjectKey, (await params).key);
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await listProjectComments(member, key)) satisfies ThreadComment[]),
  )(request);
}

export async function POST(request: Request, { params }: RouteContext<"/api/projects/[key]/comments">) {
  const key = tryFrom(ProjectKey, (await params).key);
  return apiRoute("member", NewComment, async (_memberRequest, member, newComment) => {
    const { commentId, created } = await postProjectComment(member, commentWork, key, newComment);
    return Response.json((await updatedComment(db, commentId)) satisfies ThreadComment, {
      status: created ? 201 : 200,
    });
  })(request);
}