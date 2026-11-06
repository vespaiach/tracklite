import type { IssueListPage } from "../../../../../contract";
import { ProjectKey, tryFrom } from "../../../../../domain/shared/identifiers";
import { listIssues } from "../../../../../queries";
import { apiRoute } from "../../../_route";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]/issues">) {
  const key = tryFrom(ProjectKey, (await params).key);
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await listIssues(member, key, new URL(request.url).searchParams)) satisfies IssueListPage),
  )(request);
}