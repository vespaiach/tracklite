import "server-only";
import { eq } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { DomainError } from "../shared/domain-error";
import { db } from "../shared/db";
import type { Uuid } from "../shared/ids";
import type { Transaction } from "../shared/transaction";
import { writableProject } from "./projects";
import type { LabelChanges, NewLabel, ProjectKey } from "./schemas";
import type { Label } from "../../contract";
import { findLabel } from "../queries";
import { labels, projects } from "./tables";
import type { Member } from "../identity";

function labelGone() {
  return new DomainError("notFound", "That label no longer exists");
}

async function refusingDuplicateNames<T>(write: Promise<T>) {
  try {
    return await write;
  } catch (error) {
    if (isDuplicateName(error)) {
      throw new DomainError("invalid", "Check the highlighted fields", { name: "Label already exists" });
    }
    throw error;
  }
}

function isDuplicateName(error: unknown) {
  const cause = error instanceof DrizzleQueryError ? error.cause : undefined;
  return (
    cause !== undefined && "constraint_name" in cause && cause.constraint_name === "labels_project_name_key"
  );
}

async function lockLabelProject(tx: Transaction, id: Uuid | undefined) {
  if (id === undefined) throw labelGone();

  const [label] = await tx
    .select({ projectKey: projects.key })
    .from(labels)
    .innerJoin(projects, eq(projects.id, labels.projectId))
    .where(eq(labels.id, id));
  if (!label) throw labelGone();

  await writableProject(tx, label.projectKey);
  return id;
}

export async function createLabel(
  _actor: Member,
  projectKey: ProjectKey | undefined,
  { name, color }: NewLabel,
): Promise<Label> {
  return db.transaction(async (tx): Promise<Label> => {
    const project = await writableProject(tx, projectKey);
    const [created] = await refusingDuplicateNames(
      tx
        .insert(labels)
        .values({ projectId: project.id, name, color })
        .returning({ id: labels.id, name: labels.name, color: labels.color }),
    );
    return { id: created.id, name: created.name, color: created.color, issueCount: 0 };
  });
}

export async function updateLabel(
  _actor: Member,
  id: Uuid | undefined,
  changes: LabelChanges,
): Promise<Label> {
  return db.transaction(async (tx): Promise<Label> => {
    const labelId = await lockLabelProject(tx, id);

    if (changes.name !== undefined || changes.color !== undefined) {
      await refusingDuplicateNames(tx.update(labels).set(changes).where(eq(labels.id, labelId)));
    }

    const label = await findLabel(tx, labelId);
    if (!label) throw labelGone();
    return label;
  });
}

export async function deleteLabel(_actor: Member, id: Uuid | undefined) {
  await db.transaction(async (tx) => {
    const labelId = await lockLabelProject(tx, id);
    const deleted = await tx.delete(labels).where(eq(labels.id, labelId)).returning({ id: labels.id });
    if (deleted.length === 0) throw labelGone();
  });
}