import "server-only";
import { and, asc, desc, eq, gt, inArray, ne, type SQL, sql } from "drizzle-orm";
import { assigneeChange, type Issue, type IssueProps, type Neighbours } from "../../domain/issues/issue";
import type { IssueRepository, Place } from "../../domain/issues/issue-repository";
import type { IssueStatus } from "../../domain/issues/issue-status";
import type { IssueId, RequestId } from "../../domain/shared/identifiers";
import { byIssueId, issueGone } from "../../queries";
import { takeIssueNumber } from "../projects/drizzle-project-repository";
import { projects } from "../projects/tables";
import type { Transaction } from "../transaction";
import type { TransactionScope } from "../unit-of-work";
import { toIssue, toRow } from "./issue-mapper";
import { issueAssignees, issueLabels, issues } from "./tables";

export function drizzleIssueRepository({ tx, saved }: TransactionScope): IssueRepository {
  const loaded = new WeakMap<Issue, Readonly<IssueProps>>();

  return {
    async get(id) {
      const issue = await loadIssue(tx, id);
      loaded.set(issue, issue.props);
      return issue;
    },

    idForRequest: (requestId) => idForRequest(tx, requestId),

    nextNumber: (projectId) => takeIssueNumber(tx, projectId),

    firstPositionIn: (projectId, status) => firstPositionIn(tx, projectId, status),

    neighboursAt: (issue, status, place) => neighboursAt(tx, issue.props, status, place),

    async save(issue) {
      const before = loaded.get(issue);
      if (before) await updateIssue(tx, before, issue.props);
      else await insertIssue(tx, issue.props);

      loaded.set(issue, issue.props);
      saved(issue);
    },

    async remove(issue) {
      await tx.delete(issues).where(eq(issues.id, issue.props.id));
    },
  };
}

async function loadIssue(tx: Transaction, id: IssueId | undefined) {
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

  return toIssue({
    row,
    assigneeIds: assignees.map((assignee) => assignee.memberId),
    labelIds: labelRows.map((label) => label.labelId),
  });
}

async function lockedRow(tx: Transaction, where: SQL) {
  const [target] = await tx
    .select({ row: issues })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .where(where)
    .for("update", { of: issues });
  if (!target) throw issueGone();
  return target.row;
}

async function idForRequest(tx: Transaction, requestId: RequestId) {
  const [repeated] = await tx
    .select({ id: issues.id })
    .from(issues)
    .where(eq(issues.requestId, requestId.value));
  return repeated?.id;
}

async function insertIssue(tx: Transaction, issue: IssueProps) {
  await tx.insert(issues).values(toRow(issue));

  await insertAssignees(tx, issue.id, issue.assigneeIds);

  await insertLabels(tx, issue.id, issue.labelIds);
}

async function updateIssue(tx: Transaction, before: IssueProps, after: IssueProps) {
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

async function updateRow(tx: Transaction, before: IssueProps, after: IssueProps, partsChanged: boolean) {
  const fields = changedFields(toRow(before), toRow(after));
  if (Object.keys(fields).length === 0 && !partsChanged) return;

  const touched = partsChanged || Object.keys(fields).some((field) => field !== "position");

  await tx
    .update(issues)
    .set({
      ...fields,
      ...("status" in fields ? { statusChangedAt: sql`now()` } : {}),
      ...(touched ? { updatedAt: sql`now()` } : {}),
    })
    .where(eq(issues.id, after.id));
}

function changedFields(before: ReturnType<typeof toRow>, after: ReturnType<typeof toRow>) {
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

async function firstPositionIn(tx: Transaction, projectId: string, status: IssueStatus) {
  const [first] = await tx
    .select({ position: issues.position })
    .from(issues)
    .where(and(eq(issues.projectId, projectId), eq(issues.status, status.value)))
    .orderBy(asc(issues.position), asc(issues.id))
    .limit(1);
  return first?.position ?? null;
}

async function neighboursAt(
  tx: Transaction,
  issue: IssueProps,
  status: IssueStatus,
  place: Place,
): Promise<Neighbours> {
  const otherCards = and(
    eq(issues.projectId, issue.projectId),
    eq(issues.status, status.value),
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