import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { DomainError } from "../../domain/shared/domain-error";
import type { Transaction } from "../../infrastructure/transaction";
import { byProjectKey, findLabel } from "../../queries";
import { labels, projectKeys, projects } from "../../infrastructure/projects/tables";
import { labelGone, type Project, type ProjectLabel } from "./model";
import type { ProjectKey } from "./schemas";

type ProjectRows = { row: typeof projects.$inferSelect; labels: ProjectLabel[] };

function projectGone() {
  return new DomainError("notFound", "Not found");
}

export function toProject({ row, labels }: ProjectRows): Project {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    descriptionVersion: row.descriptionVersion,
    descriptionEditedBy: row.descriptionEditedBy,
    archived: row.archivedAt !== null,
    createdBy: row.createdBy,
    labels,
  };
}

export async function loadProject(tx: Transaction, key: ProjectKey | undefined) {
  const [row] = await tx.select().from(projects).where(byProjectKey(key)).for("update");
  if (!row) throw projectGone();

  const labelRows = await tx
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(labels)
    .where(eq(labels.projectId, row.id));

  return toProject({ row, labels: labelRows });
}

export async function loadLabelProject(tx: Transaction, labelId: string | undefined) {
  if (labelId === undefined) throw labelGone();

  const [label] = await tx
    .select({ projectKey: projects.key })
    .from(labels)
    .innerJoin(projects, eq(projects.id, labels.projectId))
    .where(eq(labels.id, labelId));
  if (!label) throw labelGone();

  return { project: await loadProject(tx, label.projectKey), labelId };
}

export async function saveProject(tx: Transaction, before: Project | null, after: Project) {
  if (!before) return insertProject(tx, after);

  await updateRow(tx, before, after);

  await refusingDuplicateNames(saveLabels(tx, before, after));
}

async function insertProject(tx: Transaction, project: Project) {
  const reserved = await tx
    .insert(projectKeys)
    .values({ key: project.key })
    .onConflictDoNothing()
    .returning();
  if (reserved.length === 0) {
    throw new DomainError("invalid", "Check the highlighted fields", { key: "Key already used" });
  }

  const { archived: _archived, labels: _labels, ...row } = project;
  await tx.insert(projects).values(row);
}

async function updateRow(tx: Transaction, before: Project, after: Project) {
  const columns = ["name", "description", "descriptionVersion", "descriptionEditedBy"] as const;
  const fields = Object.fromEntries(
    columns.filter((column) => before[column] !== after[column]).map((column) => [column, after[column]]),
  );
  const update =
    before.archived === after.archived
      ? fields
      : { ...fields, archivedAt: after.archived ? sql`now()` : null };
  if (Object.keys(update).length === 0) return;

  await tx.update(projects).set(update).where(eq(projects.id, after.id));
}

async function saveLabels(tx: Transaction, before: Project, after: Project) {
  const removed = before.labels.filter((label) => !after.labels.some(({ id }) => id === label.id));
  if (removed.length > 0) {
    await tx.delete(labels).where(
      inArray(
        labels.id,
        removed.map((label) => label.id),
      ),
    );
  }

  for (const label of after.labels) {
    const old = before.labels.find(({ id }) => id === label.id);
    if (!old) await tx.insert(labels).values({ ...label, projectId: after.id });
    else if (old.name !== label.name || old.color !== label.color) {
      await tx
        .update(labels)
        .set({ name: label.name, color: label.color })
        .where(and(eq(labels.id, label.id), eq(labels.projectId, after.id)));
    }
  }
}

async function refusingDuplicateNames<T>(write: Promise<T>) {
  try {
    return await write;
  } catch (error) {
    if (isDuplicateName(error)) {
      throw new DomainError("invalid", "Check the highlighted fields", { name: "Label already exists" });
    }
    throw error;
  }
}

function isDuplicateName(error: unknown) {
  const cause = error instanceof DrizzleQueryError ? error.cause : undefined;
  return (
    cause !== undefined && "constraint_name" in cause && cause.constraint_name === "labels_project_name_key"
  );
}

export async function deleteProjectRow(tx: Transaction, project: Project) {
  await tx.delete(projects).where(eq(projects.id, project.id));
}

export async function writableProject(
  tx: Transaction,
  key: ProjectKey | undefined,
  lock: "share" | "update" = "share",
) {
  const [project] = await tx.select().from(projects).where(byProjectKey(key)).for(lock);
  if (!project) throw projectGone();
  if (project.archivedAt !== null) throw new DomainError("forbidden", "This project is archived");
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

export async function savedLabel(tx: Transaction, id: string) {
  const label = await findLabel(tx, id);
  if (!label) throw labelGone();
  return label;
}