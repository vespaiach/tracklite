import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { ProjectRepository } from "../../domain/projects/project-repository";
import { tryFrom, Uuid } from "../../domain/shared/identifiers";
import { writableProject } from "../../server/projects";
import type { Transaction } from "../transaction";
import type { TransactionScope } from "../unit-of-work";
import { labels } from "./tables";

export function drizzleProjectRepository({ tx }: TransactionScope): ProjectRepository {
  return {
    writable: (key) => writableProject(tx, key, "update"),

    labelIdsOf: (projectId, labelIds) => labelIdsOf(tx, projectId, labelIds),
  };
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