import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  notExists,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { ApiError } from "../shared/api-error";
import { db } from "../shared/db";
import { type Member, memberSummary, members } from "../identity";
import { issueAssignees, issueLabels, issues } from "./tables";
import type { IssueId } from "./schemas";
import { labels, type ProjectKey, projects } from "../projects";
import {
  type IssueListPage,
  issuePriorities,
  issueStatuses,
  type ListIssue,
  type MyIssue,
  type MyIssueGroup,
} from "../../contract";
import {
  assigneesFor,
  assigneesOf,
  byIssueId,
  findIssue,
  labelsFor,
  labelsOf,
  readableProject,
  recentlyClosedOrOpen,
} from "./rows";

type SortColumn = keyof typeof sortColumns;

const listPageSize = 100;
const unassigned = "-";
const sortColumns = {
  id: { column: issues.number, ascending: true },
  status: { column: issues.status, ascending: true },
  priority: { column: issues.priority, ascending: true },
  updated: { column: issues.updatedAt, ascending: false },
};

export async function getIssue(_actor: Member, id: IssueId | undefined) {
  const where = byIssueId(id);
  const issue = where ? await findIssue(db, where) : undefined;
  if (!issue) throw new ApiError(404, "Not found");
  return issue;
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
    ...(values.includes(unassigned) ? [notExists(assignmentsOf(issues.id))] : []),
    ...(assigneeIds.length > 0 ? [inArray(issues.id, issuesAssignedTo(assigneeIds))] : []),
  ];
  return conditions.length === 0 ? undefined : or(...conditions);
}

function assignmentsOf(issueId: typeof issues.id) {
  return db
    .select({ issueId: issueAssignees.issueId })
    .from(issueAssignees)
    .where(eq(issueAssignees.issueId, issueId));
}

function issuesAssignedTo(memberIds: string[]) {
  return db
    .select({ issueId: issueAssignees.issueId })
    .from(issueAssignees)
    .where(inArray(issueAssignees.memberId, memberIds));
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
  projectKey: ProjectKey | undefined,
  params: URLSearchParams,
): Promise<IssueListPage> {
  const project = await readableProject(projectKey);

  const rows = await listRows(await listFilter(project, params), params);
  const page = rows.slice(0, listPageSize);

  const labelRows = await labelsOf(page.map((row) => row.issueId));

  const assigneeRows = await assigneesOf(
    db,
    page.map((row) => row.issueId),
  );

  const deactivatedAssignees = await deactivatedAssigneesOf(project.id);

  return {
    issues: page.map(
      (row): ListIssue => ({
        id: `${project.key}-${row.number}`,
        title: row.title,
        status: row.status,
        priority: row.priority,
        assignees: assigneesFor(assigneeRows, row.issueId),
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
    })
    .from(issues)
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
    .innerJoin(issueAssignees, eq(issueAssignees.memberId, members.id))
    .innerJoin(issues, eq(issues.id, issueAssignees.issueId))
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

function myIssueRows(memberId: string) {
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
    .where(
      and(
        inArray(issues.id, issuesAssignedTo([memberId])),
        isNull(projects.archivedAt),
        recentlyClosedOrOpen(),
      ),
    )
    .orderBy(asc(issues.status), asc(issues.priority), desc(issues.updatedAt), asc(issues.id));
}