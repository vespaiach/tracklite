import "server-only";
import { and, asc, eq, inArray, isNull, notInArray, or, type SQL, sql } from "drizzle-orm";
import { alias, type PgUpdateSetSource } from "drizzle-orm/pg-core";
import { ApiError } from "../shared/api-error";
import { db } from "../shared/db";
import type { Executor, Transaction } from "../shared/transaction";
import { publish } from "../shared/events";
import { type Member, memberSummary, members, type Username } from "../identity";
import { byProjectKey, type ProjectKey, writableProject, labels, projects } from "../projects";
import { issueAssignees, issueLabels, issues } from "./tables";
import { mentions } from "../notifications/tables";
import type { Issue, IssueStatus } from "../../contract";
import type { IssueId } from "./schemas";
import { positionBetween } from "./rules";

export type IssueUpdate = PgUpdateSetSource<typeof issues>;

const closedStatuses: IssueStatus[] = ["done", "canceled"];

const creators = alias(members, "creators");

export async function findIssue(executor: Executor, where: SQL | undefined): Promise<Issue | undefined> {
  const row = await issueRow(executor, where);
  if (!row) return undefined;

  const issueLabelRows = await labelsOfIssue(executor, row.issueId);

  const mentioned = await mentionsOfIssue(executor, row.issueId);

  const assigneeRows = await assigneesOf(executor, [row.issueId]);

  return {
    id: `${row.key}-${row.number}`,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignees: assigneeRows.map(memberSummary),
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
    })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .innerJoin(creators, eq(creators.id, issues.createdBy))
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

export function byIssueId(id: IssueId | undefined) {
  if (id === undefined) return undefined;
  const [key, number] = id.split("-");
  return and(eq(projects.key, key as ProjectKey), eq(issues.number, Number(number)));
}

export async function topOfColumn(tx: Transaction, projectId: string, status: IssueStatus) {
  const [first] = await tx
    .select({ position: issues.position })
    .from(issues)
    .where(and(eq(issues.projectId, projectId), eq(issues.status, status)))
    .orderBy(asc(issues.position), asc(issues.id))
    .limit(1);
  return positionBetween(null, first?.position ?? null);
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

export async function readableProject(projectKey: ProjectKey | undefined) {
  const [project] = await db
    .select({ id: projects.id, key: projects.key })
    .from(projects)
    .where(byProjectKey(projectKey));
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

export async function assigneesOf(executor: Executor, issueIds: string[]) {
  if (issueIds.length === 0) return [];
  return executor
    .select({
      issueId: issueAssignees.issueId,
      username: members.username,
      fullName: members.fullName,
      deactivatedAt: members.deactivatedAt,
    })
    .from(issueAssignees)
    .innerJoin(members, eq(members.id, issueAssignees.memberId))
    .where(inArray(issueAssignees.issueId, issueIds))
    .orderBy(asc(members.fullName), asc(members.username));
}

export function assigneesFor(assigneeRows: Awaited<ReturnType<typeof assigneesOf>>, issueId: string) {
  return assigneeRows.filter((assignee) => assignee.issueId === issueId).map(memberSummary);
}

export async function addAssignees(tx: Transaction, actor: Member, issueId: string, usernames: Username[]) {
  if (usernames.length === 0) return;

  const added = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(inArray(members.username, usernames), isNull(members.deactivatedAt)));
  if (added.length !== usernames.length) {
    throw new ApiError(422, "Check the highlighted fields", { assignees: "Choose an active member" });
  }

  const assigneeIds = added.map((member) => member.id);
  await tx.insert(issueAssignees).values(assigneeIds.map((memberId) => ({ issueId, memberId })));

  await publish(tx, { type: "IssueAssigned", actorId: actor.id, issueId, assigneeIds });
}

export function recentlyClosedOrOpen() {
  return or(
    notInArray(issues.status, closedStatuses),
    sql`${issues.statusChangedAt} > now() - interval '14 days'`,
  );
}