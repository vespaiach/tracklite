import "server-only";
import { db } from "../../shared/db";
import type { Transaction } from "../../shared/transaction";
import { publishAll } from "../../shared/events";
import { assertAdmin, editConflict, type Member } from "../../identity";
import { updatedProject } from "../../queries";
import { changeSettings, descriptionSaveOf, needsAdmin, type Project, saveDescription } from "../model";
import { loadProject, saveProject } from "../repository";
import type { ProjectChanges, ProjectKey } from "../schemas";

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