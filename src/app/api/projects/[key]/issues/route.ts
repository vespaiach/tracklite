import type { Issue, IssueListPage } from "../../../../../contract";
import { apiRoute } from "../../../../../server/shared/api-route";
import { parseProjectKey } from "../../../../../server/projects";
import { createIssue, listIssues, NewIssue } from "../../../../../server/issues";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]/issues">) {
  const key = parseProjectKey((await params).key);
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await listIssues(member, key, new URL(request.url).searchParams)) satisfies IssueListPage),
  )(request);
}

export async function POST(request: Request, { params }: RouteContext<"/api/projects/[key]/issues">) {
  const key = parseProjectKey((await params).key);
  return apiRoute("member", NewIssue, async (_memberRequest, member, newIssue) => {
    const { issue, created } = await createIssue(member, key, newIssue);
    return Response.json(issue satisfies Issue, { status: created ? 201 : 200 });
  })(request);
}