import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias, type PgUpdateSetSource } from "drizzle-orm/pg-core";
import { generateKeyBetween } from "fractional-indexing";
import { ApiError } from "./api-error";
import { db } from "./db";
import { conflict, replaceMentions } from "./descriptions";
import { memberSummary } from "./members";
import { notify } from "./notifications";
import { writableProject } from "./projects";
import { issueLabels, issues, labels, members, mentions, projects } from "./schema";
import type { Member } from "./sessions";
import type { IssueChange, IssueMove, NewIssue } from "../schemas/issue";
import {
  type Board,
  type BoardIssue,
  type Issue,
  type IssueListPage,
  issuePriorities,
  type IssueStatus,
  issueStatuses,
  type ListIssue,
  type MyIssue,
  type MyIssueGroup,
} from "../contract";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Transaction;
type IssueUpdate = PgUpdateSetSource<typeof issues>;
type SortColumn = keyof typeof sortColumns;

const closedStatuses: IssueStatus[] = ["done", "canceled"];

const listPageSize = 100;
const unassigned = "-";
const sortColumns = {
  id: { column: issues.number, ascending: true },
  status: { column: issues.status, ascending: true },
  priority: { column: issues.priority, ascending: true },
  updated: { column: issues.updatedAt, ascending: false },
};

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const issueIdPattern = /^([A-Za-z]{2,5})-([1-9]\d{0,8})$/;

const creators = alias(members, "creators");
const assignees = alias(members, "assignees");

async function findIssue(executor: Executor, where: SQL | undefined): Promise<Issue | undefined> {
  const row = await issueRow(executor, where);
  if (!row) return undefined;

  const issueLabelRows = await labelsOfIssue(executor, row.issueId);

  const mentioned = await mentionsOfIssue(executor, row.issueId);

  return {
    id: `${row.key}-${row.number}`,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee ? memberSummary(row.assignee) : null,
    createdBy: memberSummary(row.creator),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    labels: issueLabelRows,
    descriptionVersion: row.descriptionVersion,
    mentions: mentioned.map(memberSummary),
    archived: row.archivedAt !== null,
  };
}

async function issueRow(executor: Executor, where: SQL | undefined) {
  const [row] = await executor
    .select({
      issueId: issues.id,
      key: projects.key,
      archivedAt: projects.archivedAt,
      number: issues.number,
      title: issues.title,
      description: issues.description,
      status: issues.status,
      priority: issues.priority,
      descriptionVersion: issues.descriptionVersion,
      createdAt: issues.createdAt,
      updatedAt: issues.updatedAt,
      creator: {
        username: creators.username,
        fullName: creators.fullName,
        deactivatedAt: creators.deactivatedAt,
      },
      assignee: {
        username: assignees.username,
        fullName: assignees.fullName,
        deactivatedAt: assignees.deactivatedAt,
      },
    })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .innerJoin(creators, eq(creators.id, issues.createdBy))
    .leftJoin(assignees, eq(assignees.id, issues.assigneeId))
    .where(where);
  return row;
}

function labelsOfIssue(executor: Executor, issueId: string) {
  return executor
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(issueLabels)
    .innerJoin(labels, eq(labels.id, issueLabels.labelId))
    .where(eq(issueLabels.issueId, issueId))
    .orderBy(asc(sql`lower(${labels.name})`), asc(labels.name));
}

function mentionsOfIssue(executor: Executor, issueId: string) {
  return executor
    .select({ username: members.username, fullName: members.fullName, deactivatedAt: members.deactivatedAt })
    .from(mentions)
    .innerJoin(members, eq(members.id, mentions.memberId))
    .where(eq(mentions.issueId, issueId))
    .orderBy(asc(members.username));
}

function fieldError(field: string, message: string) {
  return new ApiError(422, "Check the highlighted fields", { [field]: message });
}

export function issueGone() {
  return new ApiError(404, "This issue was deleted");
}

function labelGone() {
  return new ApiError(404, "That label no longer exists");
}

export function byIssueId(id: string) {
  const match = issueIdPattern.exec(id);
  return match
    ? and(eq(projects.key, match[1].toUpperCase()), eq(issues.number, Number(match[2])))
    : undefined;
}

async function topOfColumn(tx: Transaction, projectId: string, status: IssueStatus) {
  const [first] = await tx
    .select({ position: issues.position })
    .from(issues)
    .where(and(eq(issues.projectId, projectId), eq(issues.status, status)))
    .orderBy(asc(issues.position), asc(issues.id))
    .limit(1);
  return generateKeyBetween(null, first?.position ?? null);
}

export async function createIssue(actor: Member, projectKey: string, { requestId, title, status }: NewIssue) {
  return db.transaction(async (tx) => {
    const project = await writableProject(tx, projectKey, "update");

    const repeated = await findIssue(tx, eq(issues.requestId, requestId));
    if (repeated) return { issue: repeated, created: false };

    const number = await takeIssueNumber(tx, project.id);

    const position = await topOfColumn(tx, project.id, status);

    const [inserted] = await tx
      .insert(issues)
      .values({
        projectId: project.id,
        number,
        title,
        status,
        priority: "none",
        position,
        createdBy: actor.id,
        requestId,
      })
      .returning({ id: issues.id });

    const issue = await findIssue(tx, eq(issues.id, inserted.id));
    if (!issue) throw new Error("Created issue not found");

    return { issue, created: true };
  });
}

async function takeIssueNumber(tx: Transaction, projectId: string) {
  const [{ number }] = await tx
    .update(projects)
    .set({ nextIssueNumber: sql`${projects.nextIssueNumber} + 1` })
    .where(eq(projects.id, projectId))
    .returning({ number: sql<number>`${projects.nextIssueNumber} - 1` });
  return number;
}

export async function getIssue(_actor: Member, id: string) {
  const where = byIssueId(id);
  const issue = where ? await findIssue(db, where) : undefined;
  if (!issue) throw new ApiError(404, "Not found");
  return issue;
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
  if (!labelIds.every((labelId) => uuidPattern.test(labelId))) throw labelGone();

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

async function lockedIssue(tx: Transaction, where: SQL) {
  const [target] = await tx
    .select({ id: issues.id, projectKey: projects.key })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .where(where);
  if (!target) throw issueGone();

  await writableProject(tx, target.projectKey);

  const [issue] = await tx.select().from(issues).where(eq(issues.id, target.id)).for("update");
  if (!issue) throw issueGone();
  return issue;
}

async function updatedIssue(tx: Transaction, issueId: string) {
  const updated = await findIssue(tx, eq(issues.id, issueId));
  if (!updated) throw issueGone();
  return updated;
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

async function positionIn(
  tx: Transaction,
  issue: typeof issues.$inferSelect,
  status: IssueStatus,
  place: IssueMove["place"],
) {
  const otherCards = and(
    eq(issues.projectId, issue.projectId),
    eq(issues.status, status),
    ne(issues.id, issue.id),
  );

  if (place === "bottom") return bottomOf(tx, otherCards);

  const afterPosition = place === "top" ? null : await positionOf(tx, otherCards, place.after);

  const nextPosition = await firstPositionAfter(tx, otherCards, afterPosition);

  return generateKeyBetween(afterPosition, nextPosition);
}

async function bottomOf(tx: Transaction, cards: SQL | undefined) {
  const [last] = await tx
    .select({ position: issues.position })
    .from(issues)
    .where(cards)
    .orderBy(desc(issues.position), desc(issues.id))
    .limit(1);
  return generateKeyBetween(last?.position ?? null, null);
}

async function positionOf(tx: Transaction, cards: SQL | undefined, id: string) {
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

export async function moveIssue(_actor: Member, id: string, { status, place }: IssueMove) {
  const where = byIssueId(id);
  if (!where) throw issueGone();

  return db.transaction(async (tx) => {
    const issue = await lockedIssue(tx, where);

    const position = await positionIn(tx, issue, status, place);

    const statusChange: IssueUpdate =
      status === issue.status ? {} : { status, statusChangedAt: sql`now()`, updatedAt: sql`now()` };

    await tx
      .update(issues)
      .set({ position, ...statusChange })
      .where(eq(issues.id, issue.id));

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

async function readableProject(projectKey: string) {
  const [project] = await db
    .select({ id: projects.id, key: projects.key })
    .from(projects)
    .where(eq(projects.key, projectKey.toUpperCase()));
  if (!project) throw new ApiError(404, "Not found");
  return project;
}

async function labelsOf(issueIds: string[]) {
  if (issueIds.length === 0) return [];
  return db
    .select({ issueId: issueLabels.issueId, id: labels.id, name: labels.name, color: labels.color })
    .from(issueLabels)
    .innerJoin(labels, eq(labels.id, issueLabels.labelId))
    .where(inArray(issueLabels.issueId, issueIds))
    .orderBy(asc(sql`lower(${labels.name})`), asc(labels.name));
}

function labelsFor(labelRows: Awaited<ReturnType<typeof labelsOf>>, issueId: string) {
  return labelRows
    .filter((label) => label.issueId === issueId)
    .map(({ id, name, color }) => ({ id, name, color }));
}

function recentlyClosedOrOpen() {
  return or(
    notInArray(issues.status, closedStatuses),
    sql`${issues.statusChangedAt} > now() - interval '14 days'`,
  );
}

export async function getBoard(_actor: Member, projectKey: string): Promise<Board> {
  const project = await readableProject(projectKey);

  const rows = await boardRows(project.id);

  const labelRows = await labelsOf(rows.map((row) => row.issueId));

  const cards = rows.map((row): { status: IssueStatus; card: BoardIssue } => ({
    status: row.status,
    card: {
      id: `${project.key}-${row.number}`,
      title: row.title,
      priority: row.priority,
      assignee: row.assignee ? memberSummary(row.assignee) : null,
      labels: labelsFor(labelRows, row.issueId),
    },
  }));

  return issueStatuses.map((status) => {
    const column = cards.filter((entry) => entry.status === status).map((entry) => entry.card);
    return { status, count: column.length, cards: column };
  });
}

function boardRows(projectId: string) {
  return db
    .select({
      issueId: issues.id,
      number: issues.number,
      title: issues.title,
      status: issues.status,
      priority: issues.priority,
      assignee: {
        username: assignees.username,
        fullName: assignees.fullName,
        deactivatedAt: assignees.deactivatedAt,
      },
    })
    .from(issues)
    .leftJoin(assignees, eq(assignees.id, issues.assigneeId))
    .where(and(eq(issues.projectId, projectId), recentlyClosedOrOpen()))
    .orderBy(asc(issues.status), asc(issues.position), asc(issues.id));
}

function knownValues<T extends string>(values: string[], allowed: readonly T[]) {
  return allowed.filter((value) => values.includes(value));
}

function containsText(word: string) {
  return `%${word.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

function searchCondition(projectKey: string, query: string) {
  const words = query.split(/\s+/).filter((word) => word !== "");
  return and(
    ...words.map((word) => {
      const pattern = containsText(word);
      return or(
        ilike(issues.title, pattern),
        ilike(issues.description, pattern),
        sql`(${projectKey}::text || '-' || ${issues.number}::text) ilike ${pattern}`,
      );
    }),
  );
}

async function assigneeCondition(values: string[]) {
  const assigneeIds = await memberIdsNamed(
    values.filter((value) => value !== unassigned).map((value) => value.toLowerCase()),
  );
  const conditions = [
    ...(values.includes(unassigned) ? [isNull(issues.assigneeId)] : []),
    ...(assigneeIds.length > 0 ? [inArray(issues.assigneeId, assigneeIds)] : []),
  ];
  return conditions.length === 0 ? undefined : or(...conditions);
}

async function memberIdsNamed(usernames: string[]) {
  if (usernames.length === 0) return [];
  const found = await db.select({ id: members.id }).from(members).where(inArray(members.username, usernames));
  return found.map((member) => member.id);
}

async function labelCondition(projectId: string, values: string[]) {
  const labelIds = await labelIdsNamed(
    projectId,
    values.map((value) => value.toLowerCase()),
  );
  if (labelIds.length === 0) return undefined;
  return inArray(
    issues.id,
    db
      .select({ issueId: issueLabels.issueId })
      .from(issueLabels)
      .where(inArray(issueLabels.labelId, labelIds)),
  );
}

async function labelIdsNamed(projectId: string, names: string[]) {
  if (names.length === 0) return [];
  const found = await db
    .select({ id: labels.id })
    .from(labels)
    .where(and(eq(labels.projectId, projectId), inArray(sql`lower(${labels.name})`, names)));
  return found.map((label) => label.id);
}

function listOrder(params: URLSearchParams) {
  const { column, ascending } = sortColumns[sortColumn(params.get("sort"))];

  const dir = params.get("dir");
  const isAscending = dir === "asc" || dir === "desc" ? dir === "asc" : ascending;

  return [isAscending ? asc(column) : desc(column), desc(issues.updatedAt), asc(issues.id)];
}

function sortColumn(sort: string | null): SortColumn {
  return sort !== null && sort in sortColumns ? (sort as SortColumn) : "updated";
}

function listOffset(params: URLSearchParams) {
  const offset = params.get("offset") ?? "";
  return /^\d{1,9}$/.test(offset) ? Number(offset) : 0;
}

export async function listIssues(
  _actor: Member,
  projectKey: string,
  params: URLSearchParams,
): Promise<IssueListPage> {
  const project = await readableProject(projectKey);

  const rows = await listRows(await listFilter(project, params), params);
  const page = rows.slice(0, listPageSize);

  const labelRows = await labelsOf(page.map((row) => row.issueId));

  const deactivatedAssignees = await deactivatedAssigneesOf(project.id);

  return {
    issues: page.map(
      (row): ListIssue => ({
        id: `${project.key}-${row.number}`,
        title: row.title,
        status: row.status,
        priority: row.priority,
        assignee: row.assignee ? memberSummary(row.assignee) : null,
        labels: labelsFor(labelRows, row.issueId),
        updatedAt: row.updatedAt.toISOString(),
      }),
    ),
    hasMore: rows.length > listPageSize,
    deactivatedAssignees: deactivatedAssignees.map(memberSummary),
  };
}

async function listFilter(project: { id: string; key: string }, params: URLSearchParams) {
  const statuses = knownValues(params.getAll("status"), issueStatuses);
  const priorities = knownValues(params.getAll("priority"), issuePriorities);
  return and(
    eq(issues.projectId, project.id),
    statuses.length > 0 ? inArray(issues.status, statuses) : undefined,
    priorities.length > 0 ? inArray(issues.priority, priorities) : undefined,
    await assigneeCondition(params.getAll("assignee")),
    await labelCondition(project.id, params.getAll("label")),
    searchCondition(project.key, params.get("q") ?? ""),
  );
}

function listRows(where: SQL | undefined, params: URLSearchParams) {
  return db
    .select({
      issueId: issues.id,
      number: issues.number,
      title: issues.title,
      status: issues.status,
      priority: issues.priority,
      updatedAt: issues.updatedAt,
      assignee: {
        username: assignees.username,
        fullName: assignees.fullName,
        deactivatedAt: assignees.deactivatedAt,
      },
    })
    .from(issues)
    .leftJoin(assignees, eq(assignees.id, issues.assigneeId))
    .where(where)
    .orderBy(...listOrder(params))
    .limit(listPageSize + 1)
    .offset(listOffset(params));
}

function deactivatedAssigneesOf(projectId: string) {
  return db
    .selectDistinct({
      username: members.username,
      fullName: members.fullName,
      deactivatedAt: members.deactivatedAt,
    })
    .from(members)
    .innerJoin(issues, eq(issues.assigneeId, members.id))
    .where(and(eq(issues.projectId, projectId), isNotNull(members.deactivatedAt)))
    .orderBy(asc(members.fullName), asc(members.username));
}

export async function getMyIssues(actor: Member): Promise<MyIssueGroup[]> {
  const rows = await myIssueRows(actor.id);

  const labelRows = await labelsOf(rows.map((row) => row.issueId));

  return issueStatuses.flatMap((status) => {
    const group = rows
      .filter((row) => row.status === status)
      .map(
        (row): MyIssue => ({
          id: `${row.projectKey}-${row.number}`,
          title: row.title,
          projectName: row.projectName,
          priority: row.priority,
          labels: labelsFor(labelRows, row.issueId),
          updatedAt: row.updatedAt.toISOString(),
        }),
      );
    return group.length === 0 ? [] : [{ status, count: group.length, issues: group }];
  });
}

function myIssueRows(assigneeId: string) {
  return db
    .select({
      issueId: issues.id,
      projectKey: projects.key,
      number: issues.number,
      title: issues.title,
      projectName: projects.name,
      status: issues.status,
      priority: issues.priority,
      updatedAt: issues.updatedAt,
    })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .where(and(eq(issues.assigneeId, assigneeId), isNull(projects.archivedAt), recentlyClosedOrOpen()))
    .orderBy(asc(issues.status), asc(issues.priority), desc(issues.updatedAt), asc(issues.id));
}