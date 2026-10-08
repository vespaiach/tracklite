import "server-only";
import { asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { ApiError } from "./api-error";
import { db } from "./db";
import { conflict, parseDescriptionChange, replaceMentions } from "./descriptions";
import { memberSummary } from "./members";
import { notify } from "./notifications";
import { members, mentions, projectKeys, projects } from "./schema";
import { type Member, requireAdmin } from "./sessions";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Transaction;
type Project = typeof projects.$inferSelect;

const maxNameLength = 50;

function nameError(trimmedName: string) {
  if (trimmedName === "") return "Name required";
  if ([...trimmedName].length > maxNameLength) return `Too long (max ${maxNameLength})`;
  return undefined;
}

function refuseFields(fields: Record<string, string>) {
  if (Object.keys(fields).length > 0) throw new ApiError(422, "Check the highlighted fields", fields);
}

function byKey(key: string) {
  return eq(projects.key, key.toUpperCase());
}

async function projectResponse(executor: Executor, project: Project) {
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

export async function listProjects(archived: boolean) {
  const rows = await db
    .select({ key: projects.key, name: projects.name, archivedAt: projects.archivedAt })
    .from(projects)
    .where(archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt))
    .orderBy(asc(projects.name), asc(projects.key));
  return rows.map((row) => ({ ...row, archivedAt: row.archivedAt?.toISOString() ?? null }));
}

export async function getProject(key: string) {
  const [project] = await db.select().from(projects).where(byKey(key));
  if (!project) throw new ApiError(404, "Not found");
  return projectResponse(db, project);
}

export async function createProject(body: { name?: unknown; key?: unknown }) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const key = typeof body.key === "string" && /^[A-Za-z]{2,5}$/.test(body.key) ? body.key.toUpperCase() : "";
  const fields: Record<string, string> = {};
  const nameProblem = nameError(name);
  if (nameProblem) fields.name = nameProblem;
  if (key === "") fields.key = "Key must be 2 to 5 letters";
  refuseFields(fields);

  return db.transaction(async (tx) => {
    const reserved = await tx.insert(projectKeys).values({ key }).onConflictDoNothing().returning();
    if (reserved.length === 0) refuseFields({ key: "Key already used" });
    const [project] = await tx.insert(projects).values({ key, name }).returning();
    return projectResponse(tx, project);
  });
}

function parseProjectChanges(body: Record<string, unknown>) {
  const { name, archived } = body;
  const fields: Record<string, string> = {};
  if ("key" in body) fields.key = "Key can't be changed";
  const trimmedName = typeof name === "string" ? name.trim() : name === undefined ? undefined : "";
  const nameProblem = trimmedName === undefined ? undefined : nameError(trimmedName);
  if (nameProblem) fields.name = nameProblem;
  if (archived !== undefined && typeof archived !== "boolean") fields.archived = "Choose true or false";
  refuseFields(fields);
  return { name: trimmedName, archived: archived as boolean | undefined };
}

export async function updateProject(member: Member, key: string, body: Record<string, unknown>) {
  if ("description" in body || "descriptionVersion" in body) return saveDescription(member, key, body);
  if ("key" in body || "name" in body || "archived" in body) requireAdmin(member);
  const { name, archived } = parseProjectChanges(body);

  return db.transaction(async (tx) => {
    const [project] = await tx.select().from(projects).where(byKey(key)).for("update");
    if (!project) throw new ApiError(404, "Not found");
    if (name !== undefined && project.archivedAt !== null)
      throw new ApiError(403, "This project is archived");

    const changes = {
      ...(name !== undefined && { name }),
      ...(archived === true && { archivedAt: sql`coalesce(${projects.archivedAt}, now())` }),
      ...(archived === false && { archivedAt: null }),
    };
    if (Object.keys(changes).length === 0) return projectResponse(tx, project);

    const [updated] = await tx.update(projects).set(changes).where(eq(projects.id, project.id)).returning();
    return projectResponse(tx, updated);
  });
}

export async function deleteProject(key: string) {
  const deleted = await db.delete(projects).where(byKey(key)).returning({ id: projects.id });
  if (deleted.length === 0) throw new ApiError(404, "Not found");
}

async function saveDescription(member: Member, key: string, body: Record<string, unknown>) {
  const { description, descriptionVersion } = parseDescriptionChange(body);

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

export async function writableProject(tx: Transaction, key: string, lock: "share" | "update" = "share") {
  const [project] = await tx.select().from(projects).where(byKey(key)).for(lock);
  if (!project) throw new ApiError(404, "Not found");
  if (project.archivedAt !== null) throw new ApiError(403, "This project is archived");
  return project;
}