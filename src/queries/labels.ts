import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { labelGone } from "../domain/projects/project";
import { DomainError } from "../domain/shared/domain-error";
import { db } from "../infrastructure/db";
import type { Executor } from "../infrastructure/transaction";
import type { Member } from "../infrastructure/identity/tables";
import { issueLabels } from "../infrastructure/issues/tables";
import { labels, projects } from "../infrastructure/projects/tables";
import type { Label } from "../contract";
import { byProjectKey } from "./project";
import type { ProjectKey } from "../domain/shared/identifiers";

const labelResponse = {
  id: labels.id,
  name: labels.name,
  color: labels.color,
  issueCount: sql<number>`(select count(*)::int from ${issueLabels} where ${issueLabels.labelId} = ${labels.id})`,
} satisfies Record<keyof Label, unknown>;

export async function updatedLabel(executor: Executor, id: string): Promise<Label> {
  const [label] = await executor.select(labelResponse).from(labels).where(eq(labels.id, id));
  if (!label) throw labelGone();
  return label;
}

export async function listLabels(_actor: Member, projectKey: ProjectKey | undefined): Promise<Label[]> {
  const [project] = await db.select({ id: projects.id }).from(projects).where(byProjectKey(projectKey));
  if (!project) throw new DomainError("notFound", "Not found");
  return db
    .select(labelResponse)
    .from(labels)
    .where(eq(labels.projectId, project.id))
    .orderBy(asc(sql`lower(${labels.name})`), asc(labels.name));
}