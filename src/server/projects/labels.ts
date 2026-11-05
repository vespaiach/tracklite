import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "../shared/db";
import type { Uuid } from "../shared/ids";
import type { Transaction } from "../shared/transaction";
import type { Label } from "../../contract";
import { findLabel } from "../queries";
import type { Member } from "../identity";
import { addLabel, editLabel, labelGone, removeLabel } from "./model";
import { loadLabelProject, loadProject, saveProject } from "./repository";
import type { LabelChanges, NewLabel, ProjectKey } from "./schemas";

async function savedLabel(tx: Transaction, id: string) {
  const label = await findLabel(tx, id);
  if (!label) throw labelGone();
  return label;
}

export async function createLabel(
  _actor: Member,
  projectKey: ProjectKey | undefined,
  { name, color }: NewLabel,
): Promise<Label> {
  return db.transaction(async (tx) => {
    const before = await loadProject(tx, projectKey);

    const label = { id: randomUUID(), name, color };
    const { project } = addLabel(before, label);

    await saveProject(tx, before, project);

    return savedLabel(tx, label.id);
  });
}

export async function updateLabel(
  _actor: Member,
  id: Uuid | undefined,
  changes: LabelChanges,
): Promise<Label> {
  return db.transaction(async (tx) => {
    const { project: before, labelId } = await loadLabelProject(tx, id);

    const { project } = editLabel(before, labelId, changes);

    await saveProject(tx, before, project);

    return savedLabel(tx, labelId);
  });
}

export async function deleteLabel(_actor: Member, id: Uuid | undefined) {
  await db.transaction(async (tx) => {
    const { project: before, labelId } = await loadLabelProject(tx, id);

    const { project } = removeLabel(before, labelId);

    await saveProject(tx, before, project);
  });
}