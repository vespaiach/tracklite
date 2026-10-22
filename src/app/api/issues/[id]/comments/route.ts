import type { ThreadComment } from "../../../../../contract";
import { apiRoute } from "../../../../../server/shared/api-route";
import { parseIssueId } from "../../../../../server/issues";
import { listIssueComments, NewComment, postIssueComment } from "../../../../../server/comments";

export async function GET(request: Request, { params }: RouteContext<"/api/issues/[id]/comments">) {
  const id = parseIssueId((await params).id);
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await listIssueComments(member, id)) satisfies ThreadComment[]),
  )(request);
}

export async function POST(request: Request, { params }: RouteContext<"/api/issues/[id]/comments">) {
  const id = parseIssueId((await params).id);
  return apiRoute("member", NewComment, async (_memberRequest, member, newComment) => {
    const { comment, created } = await postIssueComment(member, id, newComment);
    return Response.json(comment satisfies ThreadComment, { status: created ? 201 : 200 });
  })(request);
}