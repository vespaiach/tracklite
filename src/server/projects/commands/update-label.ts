import "server-only";
import { db } from "../../../infrastructure/db";
import type { Uuid } from "../../../infrastructure/ids";
import type { Label } from "../../../contract";
import type { Member } from "../../identity";
import { editLabel } from "../model";
import { loadLabelProject, saveProject, savedLabel } from "../repository";
import type { LabelChanges } from "../schemas";

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