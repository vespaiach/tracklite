import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { PgInsertValue } from "drizzle-orm/pg-core";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "../server/shared/db";
import { comments } from "../server/comments";
import { issueLabels, issues } from "../server/issues";
import { labels, projectKeys, projects } from "../server/projects";
import { members } from "../server/identity";
import { notificationBatches, notificationDeliveries } from "../server/notifications";

type NewMember = typeof members.$inferInsert;
type NewProject = typeof projects.$inferInsert;
type NewLabel = typeof labels.$inferInsert;
type NewNotificationBatch = PgInsertValue<typeof notificationBatches>;
type NewNotificationDelivery = PgInsertValue<typeof notificationDeliveries>;

export async function createMember(overrides: Partial<NewMember> = {}) {
  const suffix = randomBytes(5).toString("hex");
  const [member] = await db
    .insert(members)
    .values({
      email: `member-${suffix}@example.test`,
      fullName: `Member ${suffix}`,
      username: `m-${suffix}`,
      passwordHash: "not-a-real-hash",
      role: "member",
      ...overrides,
    })
    .returning();
  return member;
}

export function uniqueProjectKey() {
  return Array.from({ length: 5 }, () => String.fromCharCode(65 + randomInt(26))).join("");
}

export async function createProject(overrides: Partial<NewProject> = {}) {
  const key = overrides.key ?? uniqueProjectKey();
  await db.insert(projectKeys).values({ key });
  const [project] = await db
    .insert(projects)
    .values({ name: `Project ${key}`, ...overrides, key })
    .returning();
  return project;
}

export async function createLabel(projectId: string, overrides: Partial<NewLabel> = {}) {
  const [label] = await db
    .insert(labels)
    .values({ name: `label-${randomBytes(4).toString("hex")}`, color: "gray", ...overrides, projectId })
    .returning();
  return label;
}

let nextIssueNumber = 1;
let lastPosition: string | null = null;

export async function createIssue(projectId: string, labelIds: string[] = []) {
  const creator = await createMember();
  const number = nextIssueNumber++;
  lastPosition = generateKeyBetween(lastPosition, null);
  const [issue] = await db
    .insert(issues)
    .values({
      projectId,
      number,
      title: `Issue ${number}`,
      status: "backlog",
      priority: "none",
      position: lastPosition,
      createdBy: creator.id,
      requestId: randomUUID(),
    })
    .returning();
  if (labelIds.length > 0) {
    await db.insert(issueLabels).values(labelIds.map((labelId) => ({ issueId: issue.id, labelId })));
  }
  return issue;
}

type CommentParent = { issueId: string } | { projectId: string };

export async function createComment(parent: CommentParent, authorId: string, body = "A comment") {
  const [comment] = await db
    .insert(comments)
    .values({ ...parent, authorId, body, requestId: randomUUID() })
    .returning();
  return comment;
}

export async function createNotificationBatch(
  batch: NewNotificationBatch,
  delivery: Partial<NewNotificationDelivery> = {},
) {
  const [createdBatch] = await db.insert(notificationBatches).values(batch).returning();
  const [createdDelivery] = await db
    .insert(notificationDeliveries)
    .values({ channel: "email", state: "pending", ...delivery, batchId: createdBatch.id })
    .returning();
  return { batch: createdBatch, delivery: createdDelivery };
}