import "server-only";
import { asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { DomainError } from "../shared/domain-error";
import { db } from "../shared/db";
import type { Executor } from "../shared/transaction";
import { type Member, memberSummary, members } from "../identity";
import { mentions } from "../notifications/tables";
import { issues } from "../issues/tables";
import { projects } from "../projects/tables";
import type { ProjectKey } from "../projects/schemas";
import type { IssueStatus, Project, ProjectSummary } from "../../contract";

type ProjectRow = typeof projects.$inferSelect;

export function byProjectKey(key: ProjectKey | undefined) {
  return key === undefined ? sql`false` : eq(projects.key, key);
}

const summaryColumns = {
  username: members.username,
  fullName: members.fullName,
  deactivatedAt: members.deactivatedAt,
};

export async function projectResponse(executor: Executor, project: ProjectRow): Promise<Project> {
  const mentioned = await executor
    .select(summaryColumns)
    .from(mentions)
    .innerJoin(members, eq(members.id, mentions.memberId))
    .where(eq(mentions.projectId, project.id))
    .orderBy(asc(members.username));

  return {
    key: project.key,
    name: project.name,
    description: project.description,
    descriptionVersion: project.descriptionVersion,
    mentions: mentioned.map(memberSummary),
    archivedAt: project.archivedAt?.toISOString() ?? null,
    issueCounts: await issueCounts(executor, project.id),
    createdAt: project.createdAt.toISOString(),
    createdBy: await creator(executor, project.createdBy),
  };
}

async function issueCounts(executor: Executor, projectId: string) {
  const rows = await executor
    .select({ status: issues.status, count: sql<number>`count(*)::int` })
    .from(issues)
    .where(eq(issues.projectId, projectId))
    .groupBy(issues.status);

  const counts: Record<IssueStatus, number> = {
    backlog: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
    canceled: 0,
  };
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

async function creator(executor: Executor, memberId: string | null) {
  if (memberId === null) return null;

  const [member] = await executor.select(summaryColumns).from(members).where(eq(members.id, memberId));
  return memberSummary(member);
}

export async function listProjects(_actor: Member, archived: boolean): Promise<ProjectSummary[]> {
  const rows = await db
    .select({ key: projects.key, name: projects.name, archivedAt: projects.archivedAt })
    .from(projects)
    .where(archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt))
    .orderBy(asc(projects.name), asc(projects.key));
  return rows.map(
    (row): ProjectSummary => ({
      key: row.key,
      name: row.name,
      archivedAt: row.archivedAt?.toISOString() ?? null,
    }),
  );
}

export async function getProject(_actor: Member, key: ProjectKey | undefined) {
  const [project] = await db.select().from(projects).where(byProjectKey(key));
  if (!project) throw new DomainError("notFound", "Not found");
  return projectResponse(db, project);
}