import "server-only";
import { and, asc, eq, inArray, notInArray, or, type SQL, sql } from "drizzle-orm";
import { alias, type PgUpdateSetSource } from "drizzle-orm/pg-core";
import { generateKeyBetween } from "fractional-indexing";
import { ApiError } from "../shared/api-error";
import { db } from "../shared/db";
import type { Executor, Transaction } from "../shared/transaction";
import { memberSummary, members } from "../identity";
import { writableProject, labels, projects } from "../projects";
import { issueLabels, issues } from "./tables";
import { mentions } from "../notifications";
import type { Issue, IssueStatus } from "../../contract";

export type IssueUpdate = PgUpdateSetSource<typeof issues>;

const closedStatuses: IssueStatus[] = ["done", "canceled"];

const issueIdPattern = /^([A-Za-z]{2,5})-([1-9]\d{0,8})$/;

const creators = alias(members, "creators");
export const assignees = alias(members, "assignees");

export async function findIssue(executor: Executor, where: SQL | undefined): Promise<Issue | undefined> {
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

export function issueGone() {
  return new ApiError(404, "This issue was deleted");
}

export function byIssueId(id: string) {
  const match = issueIdPattern.exec(id);
  return match
    ? and(eq(projects.key, match[1].toUpperCase()), eq(issues.number, Number(match[2])))
    : undefined;
}

export async function topOfColumn(tx: Transaction, projectId: string, status: IssueStatus) {
  const [first] = await tx
    .select({ position: issues.position })
    .from(issues)
    .where(and(eq(issues.projectId, projectId), eq(issues.status, status)))
    .orderBy(asc(issues.position), asc(issues.id))
    .limit(1);
  return generateKeyBetween(null, first?.position ?? null);
}

export async function lockedIssue(tx: Transaction, where: SQL) {
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

export async function updatedIssue(tx: Transaction, issueId: string) {
  const updated = await findIssue(tx, eq(issues.id, issueId));
  if (!updated) throw issueGone();
  return updated;
}

export async function readableProject(projectKey: string) {
  const [project] = await db
    .select({ id: projects.id, key: projects.key })
    .from(projects)
    .where(eq(projects.key, projectKey.toUpperCase()));
  if (!project) throw new ApiError(404, "Not found");
  return project;
}

export async function labelsOf(issueIds: string[]) {
  if (issueIds.length === 0) return [];
  return db
    .select({ issueId: issueLabels.issueId, id: labels.id, name: labels.name, color: labels.color })
    .from(issueLabels)
    .innerJoin(labels, eq(labels.id, issueLabels.labelId))
    .where(inArray(issueLabels.issueId, issueIds))
    .orderBy(asc(sql`lower(${labels.name})`), asc(labels.name));
}

export function labelsFor(labelRows: Awaited<ReturnType<typeof labelsOf>>, issueId: string) {
  return labelRows
    .filter((label) => label.issueId === issueId)
    .map(({ id, name, color }) => ({ id, name, color }));
}

export function recentlyClosedOrOpen() {
  return or(
    notInArray(issues.status, closedStatuses),
    sql`${issues.statusChangedAt} > now() - interval '14 days'`,
  );
}