import type { ThreadComment } from "../../../../../client/api";
import { apiRoute } from "../../../../../server/api-route";
import { listProjectComments, postProjectComment } from "../../../../../server/comments";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]/comments">) {
  const { key } = await params;
  return apiRoute("member", async () =>
    Response.json((await listProjectComments(key)) satisfies ThreadComment[]),
  )(request);
}

export async function POST(request: Request, { params }: RouteContext<"/api/projects/[key]/comments">) {
  const { key } = await params;
  return apiRoute("member", async (memberRequest, member) => {
    const { comment, created } = await postProjectComment(key, member, await memberRequest.json());
    return Response.json(comment satisfies ThreadComment, { status: created ? 201 : 200 });
  })(request);
}