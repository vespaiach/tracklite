import type { Issue, IssueListPage } from "../../../../../client/api";
import { apiRoute } from "../../../../../server/api-route";
import { createIssue, listIssues } from "../../../../../server/issues";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]/issues">) {
  const { key } = await params;
  return apiRoute("member", async () =>
    Response.json((await listIssues(key, new URL(request.url).searchParams)) satisfies IssueListPage),
  )(request);
}

export async function POST(request: Request, { params }: RouteContext<"/api/projects/[key]/issues">) {
  const { key } = await params;
  return apiRoute("member", async (memberRequest, member) => {
    const body: { requestId?: unknown; title?: unknown; status?: unknown } = await memberRequest.json();
    const { issue, created } = await createIssue(key, member, body);
    return Response.json(issue satisfies Issue, { status: created ? 201 : 200 });
  })(request);
}