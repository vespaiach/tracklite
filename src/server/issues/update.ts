import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { ApiError } from "../shared/api-error";
import { db } from "../shared/db";
import { parseUuid } from "../shared/ids";
import type { Transaction } from "../shared/transaction";
import { conflict, notify, replaceMentions } from "../notifications";
import { type Member, members, type Username } from "../identity";
import { issueLabels, issues } from "./tables";
import { labels } from "../projects";
import type { IssueChange, IssueId } from "./schemas";
import { byIssueId, type IssueUpdate, issueGone, lockedIssue, topOfColumn, updatedIssue } from "./rows";
import { descriptionSaveOf, editOf, type IssueEdit, mayDeleteIssue, sameLabels } from "./rules";

function fieldError(field: string, message: string) {
  return new ApiError(422, "Check the highlighted fields", { [field]: message });
}

function labelGone() {
  return new ApiError(404, "That label no longer exists");
}

async function activeAssigneeId(tx: Transaction, username: Username | null) {
  if (username === null) return null;
  const [assignee] = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.username, username), isNull(members.deactivatedAt)));
  if (!assignee) throw fieldError("assignee", "Choose an active member");
  return assignee.id;
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
    case "assignee": {
      const assigneeId = await activeAssigneeId(tx, edit.assignee);
      return assigneeId === issue.assigneeId ? {} : { assigneeId };
    }
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

    if (issue.descriptionVersion !== descriptionVersion) throw await conflict(tx, issue.descriptionEditedBy);

    await tx
      .update(issues)
      .set({
        description,
        descriptionVersion: sql`${issues.descriptionVersion} + 1`,
        descriptionEditedBy: member.id,
        updatedAt: sql`now()`,
      })
      .where(eq(issues.id, issue.id));

    const mentioned = await replaceMentions(tx, { issueId: issue.id }, description);

    await notify(tx, mentioned, {
      kind: "mentioned",
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

    const update = await fieldChange(tx, issue, editOf(issue, change));

    if (Object.keys(update).length > 0) {
      await tx
        .update(issues)
        .set({ ...update, updatedAt: sql`now()` })
        .where(eq(issues.id, issue.id));
    }

    if (typeof update.assigneeId === "string") {
      await notify(tx, [update.assigneeId], {
        kind: "assigned",
        actorId: actor.id,
        target: { issueId: issue.id },
      });
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