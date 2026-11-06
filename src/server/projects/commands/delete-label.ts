import "server-only";
import { db } from "../../../infrastructure/db";
import type { Uuid } from "../../../infrastructure/ids";
import type { Member } from "../../identity";
import { removeLabel } from "../model";
import { loadLabelProject, saveProject } from "../repository";

export async function deleteLabel(_actor: Member, id: Uuid | undefined) {
  await db.transaction(async (tx) => {
    const { project: before, labelId } = await loadLabelProject(tx, id);

    const { project } = removeLabel(before, labelId);

    await saveProject(tx, before, project);
  });
}