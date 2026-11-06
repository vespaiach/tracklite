import "server-only";
import { DomainError } from "../../../domain/shared/domain-error";
import { db } from "../../../infrastructure/db";
import type { Member } from "../../identity";
import { mayDeleteIssue } from "../model";
import { deleteIssueRow, loadIssue } from "../repository";
import type { IssueId } from "../../../domain/shared/identifiers";

export async function deleteIssue(actor: Member, id: IssueId | undefined) {
  await db.transaction(async (tx) => {
    const issue = await loadIssue(tx, id);

    if (!mayDeleteIssue(actor, issue.createdBy)) {
      throw new DomainError("forbidden", "You don't have permission to do that.");
    }

    await deleteIssueRow(tx, issue);
  });
}