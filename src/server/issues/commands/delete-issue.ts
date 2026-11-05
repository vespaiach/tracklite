import "server-only";
import { DomainError } from "../../shared/domain-error";
import { db } from "../../shared/db";
import type { Member } from "../../identity";
import type { IssueId } from "../schemas";
import { mayDeleteIssue } from "../model";
import { deleteIssueRow, loadIssue } from "../repository";

export async function deleteIssue(actor: Member, id: IssueId | undefined) {
  await db.transaction(async (tx) => {
    const issue = await loadIssue(tx, id);

    if (!mayDeleteIssue(actor, issue.createdBy)) {
      throw new DomainError("forbidden", "You don't have permission to do that.");
    }

    await deleteIssueRow(tx, issue);
  });
}