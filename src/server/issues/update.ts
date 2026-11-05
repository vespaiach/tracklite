import "server-only";
import { DomainError } from "../shared/domain-error";
import { db } from "../shared/db";
import type { Transaction } from "../shared/transaction";
import { publishAll } from "../shared/events";
import { editConflict, type Member } from "../identity";
import type { IssueChange, IssueId } from "./schemas";
import { updatedIssue } from "./rows";
import {
  assign,
  changePriority,
  changeStatus,
  descriptionSaveOf,
  editOf,
  type Issue,
  type IssueChangeResult,
  type IssueEdit,
  mayDeleteIssue,
  relabel,
  retitle,
  saveDescription,
} from "./model";
import {
  assigneeCandidates,
  deleteIssueRow,
  firstPositionIn,
  loadIssue,
  projectLabelIds,
  saveIssue,
} from "./repository";

async function applyEdit(
  tx: Transaction,
  actor: Member,
  issue: Issue,
  edit: IssueEdit,
): Promise<IssueChangeResult> {
  switch (edit.field) {
    case "title":
      return retitle(issue, edit.title);
    case "status":
      return changeStatus(issue, edit.status, await firstPositionIn(tx, issue.projectId, edit.status));
    case "priority":
      return changePriority(issue, edit.priority);
    case "assignees":
      return assign(issue, actor, edit.assignees, await assigneeCandidates(tx, edit.assignees));
    case "labels":
      return relabel(issue, edit.labelIds, await projectLabelIds(tx, issue.projectId, edit.labelIds));
    case "none":
      return { issue, events: [] };
  }
}

async function describedChange(
  tx: Transaction,
  actor: Member,
  issue: Issue,
  { description, descriptionVersion }: { description: string; descriptionVersion: number },
) {
  const change = saveDescription(issue, actor, description, descriptionVersion);
  if ("conflictWith" in change) throw await editConflict(tx, change.conflictWith);
  return change;
}

export async function updateIssue(actor: Member, id: IssueId | undefined, change: IssueChange) {
  const descriptionSave = descriptionSaveOf(change);

  return db.transaction(async (tx) => {
    const before = await loadIssue(tx, id);

    const { issue, events } = descriptionSave
      ? await describedChange(tx, actor, before, descriptionSave)
      : await applyEdit(tx, actor, before, editOf(before, change));

    await saveIssue(tx, before, issue);

    await publishAll(tx, events);

    return updatedIssue(tx, issue.id);
  });
}

export async function deleteIssue(actor: Member, id: IssueId | undefined) {
  await db.transaction(async (tx) => {
    const issue = await loadIssue(tx, id);

    if (!mayDeleteIssue(actor, issue.createdBy)) {
      throw new DomainError("forbidden", "You don't have permission to do that.");
    }

    await deleteIssueRow(tx, issue);
  });
}