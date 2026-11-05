import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { DomainError } from "../shared/domain-error";
import { db } from "../shared/db";
import type { Executor } from "../shared/transaction";
import type { Member } from "../identity";
import { issueLabels } from "../issues/tables";
import { labels, projects } from "../projects/tables";
import type { ProjectKey } from "../projects/schemas";
import type { Label } from "../../contract";
import { byProjectKey } from "./project";

const labelResponse = {
  id: labels.id,
  name: labels.name,
  color: labels.color,
  issueCount: sql<number>`(select count(*)::int from ${issueLabels} where ${issueLabels.labelId} = ${labels.id})`,
} satisfies Record<keyof Label, unknown>;

export async function findLabel(executor: Executor, id: string): Promise<Label | undefined> {
  const [label] = await executor.select(labelResponse).from(labels).where(eq(labels.id, id));
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