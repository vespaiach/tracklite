import type { Actor } from "../../domain/identity/actor";
import type { IssueRepository } from "../../domain/issues/issue-repository";
import type { IssueId } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";

export async function deleteIssue(
  actor: Actor,
  work: UnitOfWork<{ issues: IssueRepository }>,
  id: IssueId | undefined,
) {
  await work.run(async ({ issues }) => {
    const issue = await issues.get(id);

    issue.assertDeletableBy(actor);

    await issues.remove(issue);
  });
}