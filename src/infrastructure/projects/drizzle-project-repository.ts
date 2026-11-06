import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { labelGone, type Project, type ProjectProps } from "../../domain/projects/project";
import type { ProjectRepository } from "../../domain/projects/project-repository";
import { DomainError } from "../../domain/shared/domain-error";
import { ProjectKey, tryFrom, Uuid } from "../../domain/shared/identifiers";
import { byProjectKey } from "../../queries";
import type { Transaction } from "../transaction";
import type { TransactionScope } from "../unit-of-work";
import { toLabelRow, toProject, toRow } from "./project-mapper";
import { labels, projectKeys, projects } from "./tables";

type Lock = "update" | "share";

export function drizzleProjectRepository({ tx, saved }: TransactionScope): ProjectRepository {
  const loaded = new WeakMap<Project, Readonly<ProjectProps>>();

  function track(project: Project) {
    loaded.set(project, project.props);
    return project;
  }

  return {
    async get(key) {
      return track(await existingProject(tx, key, "update"));
    },

    async hold(key) {
      const project = await loadProject(tx, key, "share");
      return project && track(project);
    },

    async withLabel(labelId) {
      const label = await labelProjectKey(tx, labelId);
      return { project: track(await existingProject(tx, label.projectKey, "update")), labelId: label.id };
    },

    labelIdsOf: (projectId, labelIds) => labelIdsOf(tx, projectId, labelIds),

    async save(project) {
      const before = loaded.get(project);
      if (before) await updateProject(tx, before, project.props);
      else await insertProject(tx, project.props);

      track(project);
      saved(project);
    },

    async remove(project) {
      await tx.delete(projects).where(eq(projects.id, project.props.id));
    },
  };
}

export async function takeIssueNumber(tx: Transaction, projectId: string) {
  const [{ number }] = await tx
    .update(projects)
    .set({ nextIssueNumber: sql`${projects.nextIssueNumber} + 1` })
    .where(eq(projects.id, projectId))
    .returning({ number: sql<number>`${projects.nextIssueNumber} - 1` });
  return number;
}

async function existingProject(tx: Transaction, key: ProjectKey | undefined, lock: Lock) {
  const project = await loadProject(tx, key, lock);
  if (!project) throw new DomainError("notFound", "Not found");
  return project;
}

async function loadProject(tx: Transaction, key: ProjectKey | undefined, lock: Lock) {
  const [row] = await tx.select().from(projects).where(byProjectKey(key)).for(lock);
  if (!row) return undefined;

  const labelRows = await tx
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(labels)
    .where(eq(labels.projectId, row.id));

  return toProject({ row, labels: labelRows });
}

async function labelProjectKey(tx: Transaction, labelId: Uuid | undefined) {
  if (labelId === undefined) throw labelGone();

  const [label] = await tx
    .select({ id: labels.id, projectKey: projects.key })
    .from(labels)
    .innerJoin(projects, eq(projects.id, labels.projectId))
    .where(eq(labels.id, labelId.value));
  if (!label) throw labelGone();

  return { id: label.id, projectKey: ProjectKey.from(label.projectKey) };
}

async function insertProject(tx: Transaction, project: ProjectProps) {
  const reserved = await tx
    .insert(projectKeys)
    .values({ key: project.key.value })
    .onConflictDoNothing()
    .returning();
  if (reserved.length === 0) {
    throw new DomainError("invalid", "Check the highlighted fields", { key: "Key already used" });
  }

  await tx.insert(projects).values(toRow(project));
}

async function updateProject(tx: Transaction, before: ProjectProps, after: ProjectProps) {
  await updateRow(tx, before, after);

  await refusingDuplicateNames(saveLabels(tx, before, after));
}

async function updateRow(tx: Transaction, before: ProjectProps, after: ProjectProps) {
  const [beforeRow, afterRow] = [toRow(before), toRow(after)];
  const columns = ["name", "description", "descriptionVersion", "descriptionEditedBy"] as const;
  const fields = Object.fromEntries(
    columns
      .filter((column) => beforeRow[column] !== afterRow[column])
      .map((column) => [column, afterRow[column]]),
  );
  const update =
    before.archived === after.archived
      ? fields
      : { ...fields, archivedAt: after.archived ? sql`now()` : null };
  if (Object.keys(update).length === 0) return;

  await tx.update(projects).set(update).where(eq(projects.id, after.id));
}

async function saveLabels(tx: Transaction, before: ProjectProps, after: ProjectProps) {
  const removed = before.labels.filter((label) => !after.labels.some(({ id }) => id === label.id));
  if (removed.length > 0) {
    await tx.delete(labels).where(
      inArray(
        labels.id,
        removed.map((label) => label.id),
      ),
    );
  }

  for (const label of after.labels.map(toLabelRow)) {
    const old = before.labels.find(({ id }) => id === label.id);
    if (!old) await tx.insert(labels).values({ ...label, projectId: after.id });
    else if (old.name.value !== label.name || old.color.value !== label.color) {
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

async function labelIdsOf(tx: Transaction, projectId: string, labelIds: string[]) {
  const validIds = labelIds.filter((labelId) => tryFrom(Uuid, labelId));
  if (validIds.length === 0) return [];
  const found = await tx
    .select({ id: labels.id })
    .from(labels)
    .where(and(inArray(labels.id, validIds), eq(labels.projectId, projectId)))
    .for("share");
  return found.map((label) => label.id);
}