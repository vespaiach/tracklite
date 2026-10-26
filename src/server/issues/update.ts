import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ApiError } from "../shared/api-error";
import { db } from "../shared/db";
import { parseUuid } from "../shared/ids";
import type { Transaction } from "../shared/transaction";
import { publish } from "../shared/events";
import { editConflict, type Member, members, type Username } from "../identity";
import { issueAssignees, issueLabels, issues } from "./tables";
import { labels } from "../projects";
import type { IssueChange, IssueId } from "./schemas";
import {
  addAssignees,
  byIssueId,
  type IssueUpdate,
  issueGone,
  lockedIssue,
  topOfColumn,
  updatedIssue,
} from "./rows";
import {
  assigneeChange,
  descriptionSaveOf,
  editOf,
  type IssueEdit,
  mayDeleteIssue,
  sameLabels,
} from "./rules";

function labelGone() {
  return new ApiError(404, "That label no longer exists");
}

async function replaceAssignees(tx: Transaction, actor: Member, issueId: string, usernames: Username[]) {
  const current = await tx
    .select({ memberId: issueAssignees.memberId, username: members.username })
    .from(issueAssignees)
    .innerJoin(members, eq(members.id, issueAssignees.memberId))
    .where(eq(issueAssignees.issueId, issueId));

  const { added, removedIds } = assigneeChange(current, usernames);

  if (removedIds.length > 0) {
    await tx
      .delete(issueAssignees)
      .where(and(eq(issueAssignees.issueId, issueId), inArray(issueAssignees.memberId, removedIds)));
  }

  await addAssignees(tx, actor, issueId, added);
  return added.length > 0 || removedIds.length > 0;
}

async function replaceLabels(tx: Transaction, issue: typeof issues.$inferSelect, labelIds: string[]) {
  await assertProjectLabels(tx, issue.projectId, labelIds);

  const current = await tx
    .select({ labelId: issueLabels.labelId })
    .from(issueLabels)
    .where(eq(issueLabels.issueId, issue.id));
  if (
    sameLabels(
      current.map((row) => row.labelId),
      labelIds,
    )
  )
    return false;

  await tx.delete(issueLabels).where(eq(issueLabels.issueId, issue.id));

  if (labelIds.length > 0) {
    await tx.insert(issueLabels).values(labelIds.map((labelId) => ({ issueId: issue.id, labelId })));
  }
  return true;
}

async function assertProjectLabels(tx: Transaction, projectId: string, labelIds: string[]) {
  if (!labelIds.every((labelId) => parseUuid(labelId))) throw labelGone();

  const found =
    labelIds.length === 0
      ? []
      : await tx
          .select({ id: labels.id })
          .from(labels)
          .where(and(inArray(labels.id, labelIds), eq(labels.projectId, projectId)))
          .for("share");
  if (found.length !== labelIds.length) throw labelGone();
}

async function fieldChange(
  tx: Transaction,
  actor: Member,
  issue: typeof issues.$inferSelect,
  edit: IssueEdit,
): Promise<IssueUpdate> {
  switch (edit.field) {
    case "title":
      return { title: edit.title };
    case "status":
      return {
        status: edit.status,
        position: await topOfColumn(tx, issue.projectId, edit.status),
        statusChangedAt: sql`now()`,
      };
    case "priority":
      return { priority: edit.priority };
    case "assignees":
      return (await replaceAssignees(tx, actor, issue.id, edit.assignees)) ? { updatedAt: sql`now()` } : {};
    case "labels":
      return (await replaceLabels(tx, issue, edit.labelIds)) ? { updatedAt: sql`now()` } : {};
    case "none":
      return {};
  }
}

async function saveDescription(
  id: IssueId | undefined,
  member: Member,
  description: string,
  descriptionVersion: number,
) {
  const where = byIssueId(id);
  if (!where) throw issueGone();

  return db.transaction(async (tx) => {
    const issue = await lockedIssue(tx, where);

    if (issue.descriptionVersion !== descriptionVersion)
      throw await editConflict(tx, issue.descriptionEditedBy);

    await tx
      .update(issues)
      .set({
        description,
        descriptionVersion: sql`${issues.descriptionVersion} + 1`,
        descriptionEditedBy: member.id,
        updatedAt: sql`now()`,
      })
      .where(eq(issues.id, issue.id));

    await publish(tx, {
      type: "DescriptionSaved",
      actorId: member.id,
      target: { issueId: issue.id },
      text: description,
    });

    return updatedIssue(tx, issue.id);
  });
}

export async function updateIssue(actor: Member, id: IssueId | undefined, change: IssueChange) {
  const descriptionSave = descriptionSaveOf(change);
  if (descriptionSave) {
    return saveDescription(id, actor, descriptionSave.description, descriptionSave.descriptionVersion);
  }

  const where = byIssueId(id);
  if (!where) throw issueGone();

  return db.transaction(async (tx) => {
    const issue = await lockedIssue(tx, where);

    const update = await fieldChange(tx, actor, issue, editOf(issue, change));

    if (Object.keys(update).length > 0) {
      await tx
        .update(issues)
        .set({ ...update, updatedAt: sql`now()` })
        .where(eq(issues.id, issue.id));
    }

    return updatedIssue(tx, issue.id);
  });
}

export async function deleteIssue(actor: Member, id: IssueId | undefined) {
  const where = byIssueId(id);
  if (!where) throw issueGone();

  await db.transaction(async (tx) => {
    const issue = await lockedIssue(tx, where);

    if (!mayDeleteIssue(actor, issue.createdBy)) {
      throw new ApiError(403, "You don't have permission to do that.");
    }

    await tx.delete(issues).where(eq(issues.id, issue.id));
  });
}