import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { ApiError } from "./api-error";
import { db } from "./db";
import { writableProject } from "./projects";
import { issueLabels, labelColor, labels, projects } from "./schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type LabelColor = (typeof labelColor.enumValues)[number];
type LabelChanges = { name?: unknown; color?: unknown };

const maxNameLength = 30;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const labelResponse = {
  id: labels.id,
  name: labels.name,
  color: labels.color,
  issueCount: sql<number>`(select count(*)::int from ${issueLabels} where ${issueLabels.labelId} = ${labels.id})`,
};

function labelGone() {
  return new ApiError(404, "That label no longer exists");
}

function checkLabelChanges(body: LabelChanges, required: boolean) {
  const fields: Record<string, string> = {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (required || body.name !== undefined) {
    if (name === "") fields.name = "Name required";
    else if ([...name].length > maxNameLength) fields.name = `Too long (max ${maxNameLength})`;
  }
  const color = labelColor.enumValues.find((value) => value === body.color);
  if ((required || body.color !== undefined) && color === undefined) fields.color = "Choose a color";
  if (Object.keys(fields).length > 0) throw new ApiError(422, "Check the highlighted fields", fields);
  return { name, color };
}

async function refusingDuplicateNames<T>(write: Promise<T>) {
  try {
    return await write;
  } catch (error) {
    const cause = error instanceof DrizzleQueryError ? error.cause : undefined;
    if (cause && "constraint_name" in cause && cause.constraint_name === "labels_project_name_key") {
      throw new ApiError(422, "Check the highlighted fields", { name: "Label already exists" });
    }
    throw error;
  }
}

async function lockLabelProject(tx: Transaction, id: string) {
  if (!uuidPattern.test(id)) throw labelGone();
  const [label] = await tx
    .select({ projectKey: projects.key })
    .from(labels)
    .innerJoin(projects, eq(projects.id, labels.projectId))
    .where(eq(labels.id, id));
  if (!label) throw labelGone();
  await writableProject(tx, label.projectKey);
}

export async function listLabels(projectKey: string) {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.key, projectKey.toUpperCase()));
  if (!project) throw new ApiError(404, "Not found");
  return db
    .select(labelResponse)
    .from(labels)
    .where(eq(labels.projectId, project.id))
    .orderBy(asc(sql`lower(${labels.name})`), asc(labels.name));
}

export async function createLabel(projectKey: string, body: LabelChanges) {
  return db.transaction(async (tx) => {
    const project = await writableProject(tx, projectKey);
    const { name, color } = checkLabelChanges(body, true);
    const [created] = await refusingDuplicateNames(
      tx
        .insert(labels)
        .values({ projectId: project.id, name, color: color as LabelColor })
        .returning({ id: labels.id, name: labels.name, color: labels.color }),
    );
    return { ...created, issueCount: 0 };
  });
}

export async function updateLabel(id: string, body: LabelChanges) {
  return db.transaction(async (tx) => {
    await lockLabelProject(tx, id);
    const { name, color } = checkLabelChanges(body, false);
    const changes = { ...(body.name !== undefined && { name }), ...(color !== undefined && { color }) };
    if (Object.keys(changes).length > 0) {
      await refusingDuplicateNames(tx.update(labels).set(changes).where(eq(labels.id, id)));
    }
    const [label] = await tx.select(labelResponse).from(labels).where(eq(labels.id, id));
    if (!label) throw labelGone();
    return label;
  });
}

export async function deleteLabel(id: string) {
  await db.transaction(async (tx) => {
    await lockLabelProject(tx, id);
    const deleted = await tx.delete(labels).where(eq(labels.id, id)).returning({ id: labels.id });
    if (deleted.length === 0) throw labelGone();
  });
}