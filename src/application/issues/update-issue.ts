import type { Actor } from "../../domain/identity/actor";
import type { MemberDirectory } from "../../domain/identity/member-directory";
import type { Issue } from "../../domain/issues/issue";
import { editOf, type IssueChange, type IssueEdit } from "../../domain/issues/issue-edit";
import type { IssueRepository } from "../../domain/issues/issue-repository";
import type { ProjectRepository } from "../../domain/projects/project-repository";
import { editConflict } from "../../domain/shared/edit-conflict";
import type { IssueId } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";

type Repositories = { issues: IssueRepository; projects: ProjectRepository; members: MemberDirectory };

async function applyEdit(
  actor: Actor,
  { issues, projects, members }: Repositories,
  issue: Issue,
  edit: IssueEdit,
) {
  switch (edit.field) {
    case "description": {
      const refused = issue.saveDescription(actor, edit.description, edit.descriptionVersion);
      if (refused) throw editConflict(await members.fullNameOf(refused.conflictWith));
      return;
    }
    case "title":
      return issue.retitle(edit.title);
    case "status":
      return issue.changeStatus(
        edit.status,
        await issues.firstPositionIn(issue.props.projectId, edit.status),
      );
    case "priority":
      return issue.changePriority(edit.priority);
    case "assignees":
      return issue.assign(actor, edit.assignees, await members.withUsernames(edit.assignees));
    case "labels":
      return issue.relabel(edit.labelIds, await projects.labelIdsOf(issue.props.projectId, edit.labelIds));
    case "none":
      return;
  }
}

export async function updateIssue(
  actor: Actor,
  work: UnitOfWork<Repositories>,
  id: IssueId | undefined,
  change: IssueChange,
) {
  return work.run(async (repositories) => {
    (await repositories.projects.hold(id?.key))?.assertWritable();

    const issue = await repositories.issues.get(id);

    await applyEdit(actor, repositories, issue, editOf(change));

    await repositories.issues.save(issue);
    return issue.props.id;
  });
}