import type { ThreadComment } from "../../../../../contract";
import { ProjectKey, tryFrom } from "../../../../../domain/shared/identifiers";
import { apiRoute } from "../../../../../server/shared/api-route";
import { NewComment, postProjectComment } from "../../../../../server/comments";
import { listProjectComments } from "../../../../../queries";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]/comments">) {
  const key = tryFrom(ProjectKey, (await params).key);
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await listProjectComments(member, key)) satisfies ThreadComment[]),
  )(request);
}

export async function POST(request: Request, { params }: RouteContext<"/api/projects/[key]/comments">) {
  const key = tryFrom(ProjectKey, (await params).key);
  return apiRoute("member", NewComment, async (_memberRequest, member, newComment) => {
    const { comment, created } = await postProjectComment(member, key, newComment);
    return Response.json(comment satisfies ThreadComment, { status: created ? 201 : 200 });
  })(request);
}