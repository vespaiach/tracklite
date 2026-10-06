import "server-only";
import { and, asc, eq, inArray, isNull, notInArray, or, type SQL, sql } from "drizzle-orm";
import { alias, type PgUpdateSetSource } from "drizzle-orm/pg-core";
import { generateKeyBetween } from "fractional-indexing";
import { ApiError } from "./api-error";
import { db } from "./db";
import { conflict, parseDescriptionChange, replaceMentions } from "./descriptions";
import { memberSummary } from "./members";
import { writableProject } from "./projects";
import {
  issueLabels,
  issuePriority,
  issueStatus,
  issues,
  labels,
  members,
  mentions,
  projects,
} from "./schema";
import type { Member } from "./sessions";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Transaction;
type IssueStatus = (typeof issueStatus.enumValues)[number];
type NewIssue = { requestId?: unknown; title?: unknown; status?: unknown };
type IssueChange = PgUpdateSetSource<typeof issues>;

const maxLabels = 10;
const closedStatuses: IssueStatus[] = ["done", "canceled"];
const editableFields = ["title", "status", "priority", "assignee", "labelIds"];

const maxTitleLength = 200;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const issueIdPattern = /^([A-Za-z]{2,5})-([1-9]\d{0,8})$/;

const creators = alias(members, "creators");
const assignees = alias(members, "assignees");

async function findIssue(executor: Executor, where: SQL | undefined) {
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
  if (!row) return undefined;
  const issueLabelRows = await executor
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(issueLabels)
    .innerJoin(labels, eq(labels.id, issueLabels.labelId))
    .where(eq(issueLabels.issueId, row.issueId))
    .orderBy(asc(sql`lower(${labels.name})`), asc(labels.name));
  const mentioned = await executor
    .select({ username: members.username, fullName: members.fullName, deactivatedAt: members.deactivatedAt })
    .from(mentions)
    .innerJoin(members, eq(members.id, mentions.memberId))
    .where(eq(mentions.issueId, row.issueId))
    .orderBy(asc(members.username));
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

function fieldError(field: string, message: string) {
  return new ApiError(422, "Check the highlighted fields", { [field]: message });
}

function issueGone() {
  return new ApiError(404, "This issue was deleted");
}

function labelGone() {
  return new ApiError(404, "That label no longer exists");
}

function checkTitle(value: unknown) {
  const title = typeof value === "string" ? value.trim() : "";
  if (title === "") return { title, error: "Title required" };
  if ([...title].length > maxTitleLength) return { title, error: `Too long (max ${maxTitleLength})` };
  return { title, error: undefined };
}

function byIssueId(id: string) {
  const match = issueIdPattern.exec(id);
  return match
    ? and(eq(projects.key, match[1].toUpperCase()), eq(issues.number, Number(match[2])))
    : undefined;
}

function checkNewIssue(body: NewIssue) {
  const fields: Record<string, string> = {};
  const requestId =
    typeof body.requestId === "string" && uuidPattern.test(body.requestId) ? body.requestId : "";
  if (requestId === "") fields.requestId = "Invalid request";
  const { title, error } = checkTitle(body.title);
  if (error) fields.title = error;
  if (Object.keys(fields).length > 0) throw new ApiError(422, "Check the highlighted fields", fields);
  const status: IssueStatus = issueStatus.enumValues.find((value) => value === body.status) ?? "backlog";
  return { requestId, title, status };
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

export async function createIssue(projectKey: string, member: Member, body: NewIssue) {
  return db.transaction(async (tx) => {
    const project = await writableProject(tx, projectKey, "update");
    const { requestId, title, status } = checkNewIssue(body);

    const repeated = await findIssue(tx, eq(issues.requestId, requestId));
    if (repeated) return { issue: repeated, created: false };

    const [{ number }] = await tx
      .update(projects)
      .set({ nextIssueNumber: sql`${projects.nextIssueNumber} + 1` })
      .where(eq(projects.id, project.id))
      .returning({ number: sql<number>`${projects.nextIssueNumber} - 1` });
    const [inserted] = await tx
      .insert(issues)
      .values({
        projectId: project.id,
        number,
        title,
        status,
        priority: "none",
        position: await topOfColumn(tx, project.id, status),
        createdBy: member.id,
        requestId,
      })
      .returning({ id: issues.id });
    const issue = await findIssue(tx, eq(issues.id, inserted.id));
    if (!issue) throw new Error("Created issue not found");
    return { issue, created: true };
  });
}

export async function getIssue(id: string) {
  const where = byIssueId(id);
  const issue = where ? await findIssue(db, where) : undefined;
  if (!issue) throw new ApiError(404, "Not found");
  return issue;
}

async function activeAssigneeId(tx: Transaction, value: unknown) {
  if (value === null) return null;
  const username = typeof value === "string" ? value.toLowerCase() : "";
  const [assignee] = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.username, username), isNull(members.deactivatedAt)));
  if (!assignee) throw fieldError("assignee", "Choose an active member");
  return assignee.id;
}

async function replaceLabels(tx: Transaction, issue: typeof issues.$inferSelect, value: unknown) {
  if (!Array.isArray(value) || !value.every((labelId) => typeof labelId === "string")) {
    throw fieldError("labelIds", "Choose labels");
  }
  const labelIds = [...new Set(value.map((labelId) => labelId.toLowerCase()))];
  if (labelIds.length > maxLabels) throw fieldError("labelIds", `Maximum ${maxLabels} labels`);
  if (!labelIds.every((labelId) => uuidPattern.test(labelId))) throw labelGone();

  const found =
    labelIds.length === 0
      ? []
      : await tx
          .select({ id: labels.id })
          .from(labels)
          .where(and(inArray(labels.id, labelIds), eq(labels.projectId, issue.projectId)))
          .for("share");
  if (found.length !== labelIds.length) throw labelGone();

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

async function fieldChange(
  tx: Transaction,
  issue: typeof issues.$inferSelect,
  field: string,
  value: unknown,
): Promise<IssueChange> {
  if (field === "title") {
    const { title, error } = checkTitle(value);
    if (error) throw fieldError("title", error);
    return title === issue.title ? {} : { title };
  }
  if (field === "status") {
    const status = issueStatus.enumValues.find((option) => option === value);
    if (!status) throw fieldError("status", "Choose a status");
    if (status === issue.status) return {};
    return { status, position: await topOfColumn(tx, issue.projectId, status), statusChangedAt: sql`now()` };
  }
  if (field === "priority") {
    const priority = issuePriority.enumValues.find((option) => option === value);
    if (!priority) throw fieldError("priority", "Choose a priority");
    return priority === issue.priority ? {} : { priority };
  }
  if (field === "assignee") {
    const assigneeId = await activeAssigneeId(tx, value);
    return assigneeId === issue.assigneeId ? {} : { assigneeId };
  }
  return (await replaceLabels(tx, issue, value)) ? { updatedAt: sql`now()` } : {};
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

async function saveDescription(id: string, member: Member, body: Record<string, unknown>) {
  const { description, descriptionVersion } = parseDescriptionChange(body);
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
    await replaceMentions(tx, { issueId: issue.id }, description);
    return updatedIssue(tx, issue.id);
  });
}

export async function updateIssue(id: string, member: Member, body: Record<string, unknown>) {
  if ("description" in (body ?? {}) || "descriptionVersion" in (body ?? {})) {
    return saveDescription(id, member, body);
  }
  const keys = Object.keys(body ?? {});
  if (keys.length !== 1 || !editableFields.includes(keys[0])) {
    throw new ApiError(422, "Change one field at a time");
  }
  const where = byIssueId(id);
  if (!where) throw issueGone();

  return db.transaction(async (tx) => {
    const issue = await lockedIssue(tx, where);
    const change = await fieldChange(tx, issue, keys[0], body[keys[0]]);
    if (Object.keys(change).length > 0) {
      await tx
        .update(issues)
        .set({ ...change, updatedAt: sql`now()` })
        .where(eq(issues.id, issue.id));
    }
    return updatedIssue(tx, issue.id);
  });
}

export async function deleteIssue(id: string, member: Member) {
  const where = byIssueId(id);
  if (!where) throw issueGone();

  await db.transaction(async (tx) => {
    const issue = await lockedIssue(tx, where);
    if (issue.createdBy !== member.id && member.role !== "admin") {
      throw new ApiError(403, "You don't have permission to do that.");
    }
    await tx.delete(issues).where(eq(issues.id, issue.id));
  });
}

export async function getBoard(projectKey: string) {
  const [project] = await db
    .select({ id: projects.id, key: projects.key })
    .from(projects)
    .where(eq(projects.key, projectKey.toUpperCase()));
  if (!project) throw new ApiError(404, "Not found");

  const rows = await db
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
    .where(
      and(
        eq(issues.projectId, project.id),
        or(
          notInArray(issues.status, closedStatuses),
          sql`${issues.statusChangedAt} > now() - interval '14 days'`,
        ),
      ),
    )
    .orderBy(asc(issues.status), asc(issues.position), asc(issues.id));

  const labelRows =
    rows.length === 0
      ? []
      : await db
          .select({ issueId: issueLabels.issueId, id: labels.id, name: labels.name, color: labels.color })
          .from(issueLabels)
          .innerJoin(labels, eq(labels.id, issueLabels.labelId))
          .where(
            inArray(
              issueLabels.issueId,
              rows.map((row) => row.issueId),
            ),
          )
          .orderBy(asc(sql`lower(${labels.name})`), asc(labels.name));

  const cards = rows.map((row) => ({
    status: row.status,
    card: {
      id: `${project.key}-${row.number}`,
      title: row.title,
      priority: row.priority,
      assignee: row.assignee ? memberSummary(row.assignee) : null,
      labels: labelRows
        .filter((label) => label.issueId === row.issueId)
        .map(({ id, name, color }) => ({ id, name, color })),
    },
  }));
  return issueStatus.enumValues.map((status) => {
    const column = cards.filter((entry) => entry.status === status).map((entry) => entry.card);
    return { status, count: column.length, cards: column };
  });
}