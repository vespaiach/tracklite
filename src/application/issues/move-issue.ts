import type { Actor } from "../../domain/identity/actor";
import type { IssueRepository, Place } from "../../domain/issues/issue-repository";
import type { IssueStatus } from "../../domain/issues/issue-status";
import type { IssueId } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";

export type IssueMoveInput = { status: IssueStatus; place: Place };

export async function moveIssue(
  _actor: Actor,
  work: UnitOfWork<{ issues: IssueRepository }>,
  id: IssueId | undefined,
  { status, place }: IssueMoveInput,
) {
  return work.run(async ({ issues }) => {
    const issue = await issues.get(id);

    issue.move(status, await issues.neighboursAt(issue, status, place));

    await issues.save(issue);
    return issue.props.id;
  });
}