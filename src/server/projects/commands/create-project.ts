import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "../../../infrastructure/db";
import { assertAdmin, type Member } from "../../identity";
import { updatedProject } from "../../../queries";
import { newProject } from "../model";
import { saveProject } from "../repository";
import type { NewProject } from "../schemas";

export async function createProject(actor: Member, { name, key }: NewProject) {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const project = newProject(actor, { id: randomUUID(), key, name });

    await saveProject(tx, null, project);

    return updatedProject(tx, project.id);
  });
}