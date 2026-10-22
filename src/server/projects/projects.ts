import "server-only";
import { asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { ApiError } from "../shared/api-error";
import { db } from "../shared/db";
import type { Executor, Transaction } from "../shared/transaction";
import { conflict, notify, replaceMentions, mentions } from "../notifications";
import { assertAdmin, type Member, memberSummary, members } from "../identity";
import { projectKeys, projects } from "./tables";
import { needsAdmin, renamesArchived } from "./rules";
import type { NewProject, ProjectChanges, ProjectKey } from "./schemas";
import type { Project, ProjectSummary } from "../../contract";

type ProjectRow = typeof projects.$inferSelect;

function refuseFields(fields: Record<string, string>) {
  if (Object.keys(fields).length > 0) throw new ApiError(422, "Check the highlighted fields", fields);
}

export function byProjectKey(key: ProjectKey | undefined) {
  return key === undefined ? sql`false` : eq(projects.key, key);
}

async function projectResponse(executor: Executor, project: ProjectRow): Promise<Project> {
  const mentioned = await executor
    .select({ username: members.username, fullName: members.fullName, deactivatedAt: members.deactivatedAt })
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
  };
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
  if (!project) throw new ApiError(404, "Not found");
  return projectResponse(db, project);
}

export async function createProject(actor: Member, { name, key }: NewProject) {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const reserved = await tx.insert(projectKeys).values({ key }).onConflictDoNothing().returning();
    if (reserved.length === 0) refuseFields({ key: "Key already used" });

    const [project] = await tx.insert(projects).values({ key, name }).returning();
    return projectResponse(tx, project);
  });
}

export async function updateProject(actor: Member, key: ProjectKey | undefined, changes: ProjectChanges) {
  const { description, descriptionVersion } = changes;
  if (description !== undefined && descriptionVersion !== undefined)
    return saveDescription(actor, key, description, descriptionVersion);

  if (needsAdmin(changes)) assertAdmin(actor);

  return db.transaction(async (tx) => {
    const [project] = await tx.select().from(projects).where(byProjectKey(key)).for("update");
    if (!project) throw new ApiError(404, "Not found");

    if (renamesArchived(project, changes)) throw new ApiError(403, "This project is archived");

    const update = nameAndArchiveUpdate(changes);
    if (Object.keys(update).length === 0) return projectResponse(tx, project);

    const [updated] = await tx.update(projects).set(update).where(eq(projects.id, project.id)).returning();
    return projectResponse(tx, updated);
  });
}

function nameAndArchiveUpdate({ name, archived }: ProjectChanges) {
  return {
    ...(name !== undefined && { name }),
    ...(archived === true && { archivedAt: sql`coalesce(${projects.archivedAt}, now())` }),
    ...(archived === false && { archivedAt: null }),
  };
}

export async function deleteProject(actor: Member, key: ProjectKey | undefined) {
  assertAdmin(actor);
  const deleted = await db.delete(projects).where(byProjectKey(key)).returning({ id: projects.id });
  if (deleted.length === 0) throw new ApiError(404, "Not found");
}

async function saveDescription(
  member: Member,
  key: ProjectKey | undefined,
  description: string,
  descriptionVersion: number,
) {
  return db.transaction(async (tx) => {
    const project = await writableProject(tx, key, "update");

    if (project.descriptionVersion !== descriptionVersion)
      throw await conflict(tx, project.descriptionEditedBy);

    const [updated] = await tx
      .update(projects)
      .set({
        description,
        descriptionVersion: sql`${projects.descriptionVersion} + 1`,
        descriptionEditedBy: member.id,
      })
      .where(eq(projects.id, project.id))
      .returning();

    const mentioned = await replaceMentions(tx, { projectId: project.id }, description);

    await notify(tx, mentioned, {
      kind: "mentioned",
      actorId: member.id,
      target: { projectId: project.id },
      text: description,
    });

    return projectResponse(tx, updated);
  });
}

export async function writableProject(
  tx: Transaction,
  key: ProjectKey | undefined,
  lock: "share" | "update" = "share",
) {
  const [project] = await tx.select().from(projects).where(byProjectKey(key)).for(lock);
  if (!project) throw new ApiError(404, "Not found");
  if (project.archivedAt !== null) throw new ApiError(403, "This project is archived");
  return project;
}

export async function takeIssueNumber(tx: Transaction, projectId: string) {
  const [{ number }] = await tx
    .update(projects)
    .set({ nextIssueNumber: sql`${projects.nextIssueNumber} + 1` })
    .where(eq(projects.id, projectId))
    .returning({ number: sql<number>`${projects.nextIssueNumber} - 1` });
  return number;
}