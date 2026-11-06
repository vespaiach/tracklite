import { createIssue } from "../../../../../application/issues/create-issue";
import type { Issue, IssueListPage } from "../../../../../contract";
import { ProjectKey, tryFrom } from "../../../../../domain/shared/identifiers";
import { db } from "../../../../../infrastructure/db";
import { issueWork } from "../../../../../infrastructure/issues/issue-work";
import { listIssues, updatedIssue } from "../../../../../queries";
import { apiRoute } from "../../../../../server/shared/api-route";
import { NewIssue } from "../../../../_server/schemas/issues";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]/issues">) {
  const key = tryFrom(ProjectKey, (await params).key);
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await listIssues(member, key, new URL(request.url).searchParams)) satisfies IssueListPage),
  )(request);
}

export async function POST(request: Request, { params }: RouteContext<"/api/projects/[key]/issues">) {
  const key = tryFrom(ProjectKey, (await params).key);
  return apiRoute("member", NewIssue, async (_memberRequest, member, newIssue) => {
    const { issueId, created } = await createIssue(member, issueWork, key, newIssue);
    return Response.json((await updatedIssue(db, issueId)) satisfies Issue, { status: created ? 201 : 200 });
  })(request);
}