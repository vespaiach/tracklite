import "server-only";
import { setTimeout as sleep } from "node:timers/promises";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { deleteExpiredRows } from "./cleanup";
import { db } from "./db";
import { logNotificationFailure } from "./log";
import { notificationSenders } from "./notification-channels";
import {
  issues,
  members,
  mentions,
  notificationBatches,
  notificationDeliveries,
  notifications,
  projects,
} from "./schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DueDelivery = Awaited<ReturnType<typeof dueDeliveries>>[number];
type Item = Awaited<ReturnType<typeof itemsOf>>[number];

const batchSize = 10;
const pollIntervalMs = 5_000;
const retryDelaysMinutes = [1, 4, 10];
const cleanupIntervalMs = 60 * 60_000;

export async function runWorker({ signal }: { signal: AbortSignal }) {
  let nextCleanupAt = 0;
  do {
    await sendDueDeliveries();
    if (performance.now() >= nextCleanupAt) {
      await deleteExpiredRows();
      nextCleanupAt = performance.now() + cleanupIntervalMs;
    }
    await sleep(pollIntervalMs, undefined, { signal }).catch(() => {});
  } while (!signal.aborted);
}

export function sendDueDeliveries() {
  return db.transaction(async (tx) => {
    const due = await dueDeliveries(tx);
    for (const delivery of due) await deliver(tx, delivery);
    return due.length;
  });
}

function dueDeliveries(tx: Transaction) {
  return tx
    .select({
      id: notificationDeliveries.id,
      channel: notificationDeliveries.channel,
      attempts: notificationDeliveries.attempts,
      batchId: notificationBatches.id,
      recipientId: notificationBatches.recipientId,
      targetType: notificationBatches.targetType,
      targetId: notificationBatches.targetId,
    })
    .from(notificationDeliveries)
    .innerJoin(notificationBatches, eq(notificationBatches.id, notificationDeliveries.batchId))
    .where(
      and(
        eq(notificationDeliveries.state, "pending"),
        lte(
          sql`coalesce(${notificationDeliveries.nextAttemptAt}, ${notificationBatches.sendAfter})`,
          sql`now()`,
        ),
      ),
    )
    .orderBy(asc(notificationBatches.sendAfter))
    .limit(batchSize)
    .for("update", { of: notificationDeliveries, skipLocked: true });
}

function itemsOf(tx: Transaction, batchId: string) {
  return tx
    .select({
      id: notifications.id,
      kind: notifications.kind,
      commentId: notifications.commentId,
      actorName: members.fullName,
      issueRef: notifications.issueRef,
      issueTitle: notifications.issueTitle,
      projectName: notifications.projectName,
      projectKey: notifications.projectKey,
      linkPath: notifications.linkPath,
      excerpt: notifications.excerpt,
    })
    .from(notifications)
    .innerJoin(members, eq(members.id, notifications.actorId))
    .where(and(eq(notifications.batchId, batchId), eq(notifications.dropped, false)))
    .orderBy(asc(notifications.createdAt), asc(notifications.id));
}

async function deliver(tx: Transaction, delivery: DueDelivery) {
  const [recipient] = await tx.select().from(members).where(eq(members.id, delivery.recipientId));

  const items = await itemsOf(tx, delivery.batchId);

  const kept = recipient.deactivatedAt === null ? await wantedItems(tx, delivery, items) : [];

  await dropNotifications(
    tx,
    items.filter((item) => !kept.includes(item)).map((item) => item.id),
  );

  if (kept.length === 0) {
    await tx
      .update(notificationDeliveries)
      .set({ state: "dropped" })
      .where(eq(notificationDeliveries.id, delivery.id));
    return;
  }

  try {
    const { providerMessageId } = await notificationSenders[delivery.channel](recipient, kept, delivery.id);
    await tx
      .update(notificationDeliveries)
      .set({ state: "sent", providerMessageId, sentAt: sql`now()` })
      .where(eq(notificationDeliveries.id, delivery.id));
  } catch {
    await recordFailure(tx, delivery);
  }
}

async function wantedItems(tx: Transaction, delivery: DueDelivery, items: Item[]) {
  const kept: Item[] = [];
  for (const item of items) {
    if (await stillWanted(tx, delivery, item)) kept.push(item);
  }
  return kept;
}

async function dropNotifications(tx: Transaction, ids: string[]) {
  if (ids.length === 0) return;
  await tx.update(notifications).set({ dropped: true }).where(inArray(notifications.id, ids));
}

async function stillWanted(tx: Transaction, delivery: DueDelivery, item: Item) {
  if (delivery.targetType === "project") {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, delivery.targetId));
    if (!project) return true;
  } else {
    const [issue] = await tx
      .select({ assigneeId: issues.assigneeId })
      .from(issues)
      .where(eq(issues.id, delivery.targetId));
    if (!issue) return true;
    if (item.kind === "assigned") return issue.assigneeId === delivery.recipientId;
  }
  return stillMentioned(tx, delivery, item);
}

async function stillMentioned(tx: Transaction, delivery: DueDelivery, item: Item) {
  const source = item.commentId
    ? eq(mentions.commentId, item.commentId)
    : delivery.targetType === "issue"
      ? eq(mentions.issueId, delivery.targetId)
      : eq(mentions.projectId, delivery.targetId);
  const [mention] = await tx
    .select({ id: mentions.id })
    .from(mentions)
    .where(and(eq(mentions.memberId, delivery.recipientId), source));
  return mention !== undefined;
}

async function recordFailure(tx: Transaction, delivery: DueDelivery) {
  const delayMinutes = retryDelaysMinutes[delivery.attempts];
  if (delayMinutes === undefined) return markFailed(tx, delivery);
  await tx
    .update(notificationDeliveries)
    .set({
      attempts: delivery.attempts + 1,
      nextAttemptAt: sql`now() + make_interval(mins => ${delayMinutes})`,
    })
    .where(eq(notificationDeliveries.id, delivery.id));
}

async function markFailed(tx: Transaction, delivery: DueDelivery) {
  await tx
    .update(notificationDeliveries)
    .set({ state: "failed", attempts: delivery.attempts + 1 })
    .where(eq(notificationDeliveries.id, delivery.id));
  logNotificationFailure({ channel: delivery.channel, deliveryId: delivery.id });
}