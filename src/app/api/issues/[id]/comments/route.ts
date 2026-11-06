import { postIssueComment } from "../../../../../application/comments/post-comment";
import type { ThreadComment } from "../../../../../contract";
import { IssueId, tryFrom } from "../../../../../domain/shared/identifiers";
import { commentWork } from "../../../../../infrastructure/comments/comment-work";
import { db } from "../../../../../infrastructure/db";
import { listIssueComments, updatedComment } from "../../../../../queries";
import { apiRoute } from "../../../_route";
import { NewComment } from "../../../../_server/schemas/comments";

export async function GET(request: Request, { params }: RouteContext<"/api/issues/[id]/comments">) {
  const id = tryFrom(IssueId, (await params).id);
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await listIssueComments(member, id)) satisfies ThreadComment[]),
  )(request);
}

export async function POST(request: Request, { params }: RouteContext<"/api/issues/[id]/comments">) {
  const id = tryFrom(IssueId, (await params).id);
  return apiRoute("member", NewComment, async (_memberRequest, member, newComment) => {
    const { commentId, created } = await postIssueComment(member, commentWork, id, newComment);
    return Response.json((await updatedComment(db, commentId)) satisfies ThreadComment, {
      status: created ? 201 : 200,
    });
  })(request);
}