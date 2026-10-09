import type { ThreadComment } from "../../../../../contract";
import { NewComment } from "../../../../../schemas/comment";
import { apiRoute } from "../../../../../server/api-route";
import { listProjectComments, postProjectComment } from "../../../../../server/comments";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]/comments">) {
  const { key } = await params;
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await listProjectComments(member, key)) satisfies ThreadComment[]),
  )(request);
}

export async function POST(request: Request, { params }: RouteContext<"/api/projects/[key]/comments">) {
  const { key } = await params;
  return apiRoute("member", NewComment, async (_memberRequest, member, newComment) => {
    const { comment, created } = await postProjectComment(member, key, newComment);
    return Response.json(comment satisfies ThreadComment, { status: created ? 201 : 200 });
  })(request);
}