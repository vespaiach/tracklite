import "server-only";
import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { generateKeyBetween } from "fractional-indexing";
import { ApiError } from "./api-error";
import { db } from "./db";
import { memberSummary } from "./members";
import { writableProject } from "./projects";
import { issueStatus, issues, members, projects } from "./schema";
import type { Member } from "./sessions";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Transaction;
type IssueStatus = (typeof issueStatus.enumValues)[number];
type NewIssue = { requestId?: unknown; title?: unknown; status?: unknown };

const maxTitleLength = 200;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const issueIdPattern = /^([A-Za-z]{2,5})-([1-9]\d{0,8})$/;

const creators = alias(members, "creators");
const assignees = alias(members, "assignees");

async function findIssue(executor: Executor, where: SQL | undefined) {
  const [row] = await executor
    .select({
      key: projects.key,
      number: issues.number,
      title: issues.title,
      description: issues.description,
      status: issues.status,
      priority: issues.priority,
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
  };
}

function checkNewIssue(body: NewIssue) {
  const fields: Record<string, string> = {};
  const requestId =
    typeof body.requestId === "string" && uuidPattern.test(body.requestId) ? body.requestId : "";
  if (requestId === "") fields.requestId = "Invalid request";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title === "") fields.title = "Title required";
  else if ([...title].length > maxTitleLength) fields.title = `Too long (max ${maxTitleLength})`;
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
  const match = issueIdPattern.exec(id);
  const issue = match
    ? await findIssue(db, and(eq(projects.key, match[1].toUpperCase()), eq(issues.number, Number(match[2]))))
    : undefined;
  if (!issue) throw new ApiError(404, "Not found");
  return issue;
}