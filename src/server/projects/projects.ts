import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "../shared/db";
import type { Transaction } from "../shared/transaction";
import { publishAll } from "../shared/events";
import { assertAdmin, editConflict, type Member } from "../identity";
import { updatedProject } from "../queries";
import {
  changeSettings,
  descriptionSaveOf,
  needsAdmin,
  newProject,
  type Project,
  saveDescription,
} from "./model";
import { deleteProjectRow, loadProject, saveProject } from "./repository";
import type { NewProject, ProjectChanges, ProjectKey } from "./schemas";

export async function createProject(actor: Member, { name, key }: NewProject) {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const project = newProject(actor, { id: randomUUID(), key, name });

    await saveProject(tx, null, project);

    return updatedProject(tx, project.id);
  });
}

async function describedChange(
  tx: Transaction,
  actor: Member,
  project: Project,
  { description, descriptionVersion }: { description: string; descriptionVersion: number },
) {
  const change = saveDescription(project, actor, description, descriptionVersion);
  if ("conflictWith" in change) throw await editConflict(tx, change.conflictWith);
  return change;
}

export async function updateProject(actor: Member, key: ProjectKey | undefined, changes: ProjectChanges) {
  const descriptionSave = descriptionSaveOf(changes);

  if (needsAdmin(changes)) assertAdmin(actor);

  return db.transaction(async (tx) => {
    const before = await loadProject(tx, key);

    const { project, events } = descriptionSave
      ? await describedChange(tx, actor, before, descriptionSave)
      : changeSettings(before, changes);

    await saveProject(tx, before, project);

    await publishAll(tx, events);

    return updatedProject(tx, project.id);
  });
}

export async function deleteProject(actor: Member, key: ProjectKey | undefined) {
  assertAdmin(actor);
  await db.transaction(async (tx) => {
    const project = await loadProject(tx, key);

    await deleteProjectRow(tx, project);
  });
}