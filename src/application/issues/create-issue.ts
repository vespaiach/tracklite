import type { Actor } from "../../domain/identity/actor";
import type { MemberDirectory } from "../../domain/identity/member-directory";
import { Issue } from "../../domain/issues/issue";
import type { IssueRepository } from "../../domain/issues/issue-repository";
import type { IssueStatus } from "../../domain/issues/issue-status";
import type { IssueTitle } from "../../domain/issues/issue-title";
import type { ProjectRepository } from "../../domain/projects/project-repository";
import type { ProjectKey, RequestId, Username } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";

type Repositories = { issues: IssueRepository; projects: ProjectRepository; members: MemberDirectory };

export type NewIssueInput = {
  requestId: RequestId;
  title: IssueTitle;
  status: IssueStatus;
  assignees: Username[];
};

export async function createIssue(
  actor: Actor,
  work: UnitOfWork<Repositories>,
  projectKey: ProjectKey | undefined,
  { requestId, title, status, assignees }: NewIssueInput,
) {
  return work.run(async ({ issues, projects, members }) => {
    const project = await projects.get(projectKey);
    project.assertWritable();

    const repeatedId = await issues.idForRequest(requestId);
    if (repeatedId) return { issueId: repeatedId, created: false };

    const issue = Issue.create(actor, {
      projectId: project.props.id,
      number: await issues.nextNumber(project.props.id),
      requestId,
      title,
      status,
      firstInColumn: await issues.firstPositionIn(project.props.id, status),
      assignees,
      candidates: await members.withUsernames(assignees),
    });

    await issues.save(issue);
    return { issueId: issue.props.id, created: true };
  });
}