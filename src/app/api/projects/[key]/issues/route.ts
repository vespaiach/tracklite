import type { Issue } from "../../../../../client/api";
import { apiRoute } from "../../../../../server/api-route";
import { createIssue } from "../../../../../server/issues";

export async function POST(request: Request, { params }: RouteContext<"/api/projects/[key]/issues">) {
  const { key } = await params;
  return apiRoute("member", async (memberRequest, member) => {
    const body: { requestId?: unknown; title?: unknown; status?: unknown } = await memberRequest.json();
    const { issue, created } = await createIssue(key, member, body);
    return Response.json(issue satisfies Issue, { status: created ? 201 : 200 });
  })(request);
}