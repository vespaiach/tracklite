import "server-only";
import { db } from "../../../infrastructure/db";
import { assertAdmin, type Member } from "../../identity";
import { deleteProjectRow, loadProject } from "../repository";
import type { ProjectKey } from "../schemas";

export async function deleteProject(actor: Member, key: ProjectKey | undefined) {
  assertAdmin(actor);
  await db.transaction(async (tx) => {
    const project = await loadProject(tx, key);

    await deleteProjectRow(tx, project);
  });
}