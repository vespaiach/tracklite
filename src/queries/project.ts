import "server-only";
import { asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { DomainError } from "../domain/shared/domain-error";
import { db } from "../infrastructure/db";
import type { Executor } from "../infrastructure/transaction";
import { memberSummary } from "../domain/identity/member-summary";
import { type Member, members } from "../infrastructure/identity/tables";
import { mentions } from "../infrastructure/notifications/tables";
import { issues } from "../infrastructure/issues/tables";
import { projects } from "../infrastructure/projects/tables";
import type { IssueStatus, Project, ProjectSummary } from "../contract";
import type { ProjectKey } from "../domain/shared/identifiers";

type ProjectRow = typeof projects.$inferSelect;

export function byProjectKey(key: ProjectKey | undefined) {
  return key === undefined ? sql`false` : eq(projects.key, key.value);
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

export async function updatedProject(executor: Executor, id: string) {
  const [project] = await executor.select().from(projects).where(eq(projects.id, id));
  if (!project) throw new DomainError("notFound", "Not found");
  return projectResponse(executor, project);
}

export async function getProject(_actor: Member, key: ProjectKey | undefined) {
  const [project] = await db.select().from(projects).where(byProjectKey(key));
  if (!project) throw new DomainError("notFound", "Not found");
  return projectResponse(db, project);
}