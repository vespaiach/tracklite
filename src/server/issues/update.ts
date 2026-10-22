import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { ApiError } from "../shared/api-error";
import { db } from "../shared/db";
import { isUuid } from "../shared/ids";
import type { Transaction } from "../shared/transaction";
import { conflict, notify, replaceMentions } from "../notifications";
import { type Member, members } from "../identity";
import { issueLabels, issues } from "./tables";
import { labels } from "../projects";
import type { IssueChange } from "./schemas";
import { byIssueId, type IssueUpdate, issueGone, lockedIssue, topOfColumn, updatedIssue } from "./rows";

function fieldError(field: string, message: string) {
  return new ApiError(422, "Check the highlighted fields", { [field]: message });
}

function labelGone() {
  return new ApiError(404, "That label no longer exists");
}

async function activeAssigneeId(tx: Transaction, username: string | null) {
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
  const unchanged =
    current.length === labelIds.length && current.every((row) => labelIds.includes(row.labelId));
  if (unchanged) return false;

  await tx.delete(issueLabels).where(eq(issueLabels.issueId, issue.id));

  if (labelIds.length > 0) {
    await tx.insert(issueLabels).values(labelIds.map((labelId) => ({ issueId: issue.id, labelId })));
  }
  return true;
}

async function assertProjectLabels(tx: Transaction, projectId: string, labelIds: string[]) {
  if (!labelIds.every(isUuid)) throw labelGone();

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
  { title, status, priority, assignee, labelIds }: IssueChange,
): Promise<IssueUpdate> {
  if (title !== undefined) return title === issue.title ? {} : { title };
  if (status !== undefined) {
    if (status === issue.status) return {};
    return { status, position: await topOfColumn(tx, issue.projectId, status), statusChangedAt: sql`now()` };
  }
  if (priority !== undefined) return priority === issue.priority ? {} : { priority };
  if (assignee !== undefined) {
    const assigneeId = await activeAssigneeId(tx, assignee);
    return assigneeId === issue.assigneeId ? {} : { assigneeId };
  }
  if (labelIds !== undefined && (await replaceLabels(tx, issue, labelIds))) return { updatedAt: sql`now()` };
  return {};
}

async function saveDescription(id: string, member: Member, description: string, descriptionVersion: number) {
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

export async function updateIssue(actor: Member, id: string, change: IssueChange) {
  if (change.description !== undefined && change.descriptionVersion !== undefined) {
    return saveDescription(id, actor, change.description, change.descriptionVersion);
  }

  const where = byIssueId(id);
  if (!where) throw issueGone();

  return db.transaction(async (tx) => {
    const issue = await lockedIssue(tx, where);

    const update = await fieldChange(tx, issue, change);

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

export async function deleteIssue(actor: Member, id: string) {
  const where = byIssueId(id);
  if (!where) throw issueGone();

  await db.transaction(async (tx) => {
    const issue = await lockedIssue(tx, where);

    if (issue.createdBy !== actor.id && actor.role !== "admin") {
      throw new ApiError(403, "You don't have permission to do that.");
    }

    await tx.delete(issues).where(eq(issues.id, issue.id));
  });
}