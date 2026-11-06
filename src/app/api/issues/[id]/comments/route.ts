import type { ThreadComment } from "../../../../../contract";
import { IssueId, tryFrom } from "../../../../../domain/shared/identifiers";
import { apiRoute } from "../../../../../server/shared/api-route";
import { NewComment, postIssueComment } from "../../../../../server/comments";
import { listIssueComments } from "../../../../../queries";

export async function GET(request: Request, { params }: RouteContext<"/api/issues/[id]/comments">) {
  const id = tryFrom(IssueId, (await params).id);
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await listIssueComments(member, id)) satisfies ThreadComment[]),
  )(request);
}

export async function POST(request: Request, { params }: RouteContext<"/api/issues/[id]/comments">) {
  const id = tryFrom(IssueId, (await params).id);
  return apiRoute("member", NewComment, async (_memberRequest, member, newComment) => {
    const { comment, created } = await postIssueComment(member, id, newComment);
    return Response.json(comment satisfies ThreadComment, { status: created ? 201 : 200 });
  })(request);
}