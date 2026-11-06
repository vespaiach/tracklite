import "server-only";
import { and, asc, desc, eq, gt, inArray, ne, type SQL, sql } from "drizzle-orm";
import type { Transaction } from "../../infrastructure/transaction";
import { members } from "../identity";
import { labels, projects, writableProject } from "../projects";
import type { IssueStatus } from "../../contract";
import { issueAssignees, issueLabels, issues } from "../../infrastructure/issues/tables";
import type { IssueMove } from "./schemas";
import { byIssueId, issueGone } from "../../queries";
import { type AssigneeCandidate, assigneeChange, type Issue, type Neighbours } from "./model";
import { type IssueId, ProjectKey, tryFrom, type Username, Uuid } from "../../domain/shared/identifiers";

type IssueRows = {
  row: typeof issues.$inferSelect;
  assignees: { memberId: string }[];
  labels: { labelId: string }[];
};

export function toIssue({ row, assignees, labels }: IssueRows): Issue {
  return {
    id: row.id,
    projectId: row.projectId,
    number: row.number,
    requestId: row.requestId,
    title: row.title,
    description: row.description,
    descriptionVersion: row.descriptionVersion,
    descriptionEditedBy: row.descriptionEditedBy,
    status: row.status,
    priority: row.priority,
    position: row.position,
    createdBy: row.createdBy,
    assigneeIds: assignees.map((assignee) => assignee.memberId),
    labelIds: labels.map((label) => label.labelId),
  };
}

export async function loadIssue(tx: Transaction, id: IssueId | undefined) {
  const where = byIssueId(id);
  if (!where) throw issueGone();

  const row = await lockedRow(tx, where);

  const assignees = await tx
    .select({ memberId: issueAssignees.memberId })
    .from(issueAssignees)
    .where(eq(issueAssignees.issueId, row.id));

  const labelRows = await tx
    .select({ labelId: issueLabels.labelId })
    .from(issueLabels)
    .where(eq(issueLabels.issueId, row.id));

  return toIssue({ row, assignees, labels: labelRows });
}

async function lockedRow(tx: Transaction, where: SQL) {
  const [target] = await tx
    .select({ id: issues.id, projectKey: projects.key })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .where(where);
  if (!target) throw issueGone();

  await writableProject(tx, ProjectKey.from(target.projectKey));

  const [row] = await tx.select().from(issues).where(eq(issues.id, target.id)).for("update");
  if (!row) throw issueGone();
  return row;
}

export async function saveIssue(tx: Transaction, before: Issue | null, after: Issue) {
  if (!before) return insertIssue(tx, after);

  const assignees = assigneeChange(before.assigneeIds, after.assigneeIds);
  const removedLabels = before.labelIds.filter((labelId) => !after.labelIds.includes(labelId));
  const addedLabels = after.labelIds.filter((labelId) => !before.labelIds.includes(labelId));
  const partsChanged = [assignees.added, assignees.removed, addedLabels, removedLabels].some(
    (ids) => ids.length > 0,
  );

  await updateRow(tx, before, after, partsChanged);

  if (assignees.removed.length > 0) {
    await tx
      .delete(issueAssignees)
      .where(and(eq(issueAssignees.issueId, after.id), inArray(issueAssignees.memberId, assignees.removed)));
  }
  await insertAssignees(tx, after.id, assignees.added);

  if (removedLabels.length > 0) {
    await tx
      .delete(issueLabels)
      .where(and(eq(issueLabels.issueId, after.id), inArray(issueLabels.labelId, removedLabels)));
  }
  await insertLabels(tx, after.id, addedLabels);
}

async function insertIssue(tx: Transaction, issue: Issue) {
  const { assigneeIds, labelIds, ...row } = issue;
  await tx.insert(issues).values(row);

  await insertAssignees(tx, issue.id, assigneeIds);

  await insertLabels(tx, issue.id, labelIds);
}

async function updateRow(tx: Transaction, before: Issue, after: Issue, partsChanged: boolean) {
  const fields = changedFields(before, after);
  if (Object.keys(fields).length === 0 && !partsChanged) return;

  const touched = partsChanged || Object.keys(fields).some((field) => field !== "position");

  await tx
    .update(issues)
    .set({
      ...fields,
      ...(before.status !== after.status ? { statusChangedAt: sql`now()` } : {}),
      ...(touched ? { updatedAt: sql`now()` } : {}),
    })
    .where(eq(issues.id, after.id));
}

function changedFields(before: Issue, after: Issue) {
  const columns = [
    "title",
    "description",
    "descriptionVersion",
    "descriptionEditedBy",
    "status",
    "priority",
    "position",
  ] as const;
  return Object.fromEntries(
    columns.filter((column) => before[column] !== after[column]).map((column) => [column, after[column]]),
  );
}

async function insertAssignees(tx: Transaction, issueId: string, memberIds: readonly string[]) {
  if (memberIds.length === 0) return;
  await tx.insert(issueAssignees).values(memberIds.map((memberId) => ({ issueId, memberId })));
}

async function insertLabels(tx: Transaction, issueId: string, labelIds: readonly string[]) {
  if (labelIds.length === 0) return;
  await tx.insert(issueLabels).values(labelIds.map((labelId) => ({ issueId, labelId })));
}

export async function deleteIssueRow(tx: Transaction, issue: Issue) {
  await tx.delete(issues).where(eq(issues.id, issue.id));
}

export async function assigneeCandidates(
  tx: Transaction,
  usernames: Username[],
): Promise<AssigneeCandidate[]> {
  if (usernames.length === 0) return [];
  const rows = await tx
    .select({ id: members.id, username: members.username, deactivatedAt: members.deactivatedAt })
    .from(members)
    .where(inArray(
        members.username,
        usernames.map((username) => username.value),
      ));
  return rows.map(({ id, username, deactivatedAt }) => ({
    id,
    username,
    deactivated: deactivatedAt !== null,
  }));
}

export async function projectLabelIds(tx: Transaction, projectId: string, labelIds: string[]) {
  const validIds = labelIds.filter((labelId) => tryFrom(Uuid, labelId));
  if (validIds.length === 0) return [];
  const found = await tx
    .select({ id: labels.id })
    .from(labels)
    .where(and(inArray(labels.id, validIds), eq(labels.projectId, projectId)))
    .for("share");
  return found.map((label) => label.id);
}

export async function firstPositionIn(tx: Transaction, projectId: string, status: IssueStatus) {
  const [first] = await tx
    .select({ position: issues.position })
    .from(issues)
    .where(and(eq(issues.projectId, projectId), eq(issues.status, status)))
    .orderBy(asc(issues.position), asc(issues.id))
    .limit(1);
  return first?.position ?? null;
}

export async function neighboursAt(
  tx: Transaction,
  issue: Issue,
  status: IssueStatus,
  place: IssueMove["place"],
): Promise<Neighbours> {
  const otherCards = and(
    eq(issues.projectId, issue.projectId),
    eq(issues.status, status),
    ne(issues.id, issue.id),
  );

  if (place === "bottom") return { before: await lastPosition(tx, otherCards), after: null };

  const before = place === "top" ? null : await positionOf(tx, otherCards, place.after);

  return { before, after: await firstPositionAfter(tx, otherCards, before) };
}

async function lastPosition(tx: Transaction, cards: SQL | undefined) {
  const [last] = await tx
    .select({ position: issues.position })
    .from(issues)
    .where(cards)
    .orderBy(desc(issues.position), desc(issues.id))
    .limit(1);
  return last?.position ?? null;
}

async function positionOf(tx: Transaction, cards: SQL | undefined, id: IssueId | undefined) {
  const where = byIssueId(id);
  if (!where) return null;
  const [card] = await tx
    .select({ position: issues.position })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .where(and(cards, where));
  return card?.position ?? null;
}

async function firstPositionAfter(tx: Transaction, cards: SQL | undefined, position: string | null) {
  const [next] = await tx
    .select({ position: issues.position })
    .from(issues)
    .where(position === null ? cards : and(cards, gt(issues.position, position)))
    .orderBy(asc(issues.position), asc(issues.id))
    .limit(1);
  return next?.position ?? null;
}