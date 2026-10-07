import { apiRoute } from "../../../../../server/api-route";
import { listIssueComments, postIssueComment } from "../../../../../server/comments";

export async function GET(request: Request, { params }: RouteContext<"/api/issues/[id]/comments">) {
  const { id } = await params;
  return apiRoute("member", async () => Response.json(await listIssueComments(id)))(request);
}

export async function POST(request: Request, { params }: RouteContext<"/api/issues/[id]/comments">) {
  const { id } = await params;
  return apiRoute("member", async (memberRequest, member) => {
    const { comment, created } = await postIssueComment(id, member, await memberRequest.json());
    return Response.json(comment, { status: created ? 201 : 200 });
  })(request);
}