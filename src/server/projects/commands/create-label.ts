import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "../../../infrastructure/db";
import type { Label } from "../../../contract";
import type { Member } from "../../identity";
import { addLabel } from "../model";
import { loadProject, saveProject, savedLabel } from "../repository";
import type { NewLabel } from "../schemas";
import type { ProjectKey } from "../../../domain/shared/identifiers";

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