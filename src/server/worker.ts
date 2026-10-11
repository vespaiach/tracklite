import "server-only";
import { setTimeout as sleep } from "node:timers/promises";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { deleteExpiredRows } from "./cleanup";
import { db } from "./db";
import { logNotificationError, logNotificationFailure } from "./log";
import { notificationSenders, type Recipient } from "./notification-channels";
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
type ClaimedDelivery = DueDelivery & { lease: string };
type Item = Awaited<ReturnType<typeof itemsOf>>[number];

const batchSize = 10;
const pollIntervalMs = 5_000;
const retryDelaysMinutes = [1, 4, 10];
const cleanupIntervalMs = 60 * 60_000;

export async function runWorker({ signal }: { signal: AbortSignal }) {
  let nextCleanupAt = 0;
  do {
    const claimed = await runPass();

    if (performance.now() >= nextCleanupAt) {
      await deleteExpiredRows().catch(logWorkerError);
      nextCleanupAt = performance.now() + cleanupIntervalMs;
    }

    if (claimed < batchSize) await sleep(pollIntervalMs, undefined, { signal }).catch(() => {});
  } while (!signal.aborted);
}

export async function sendDueDeliveries() {
  const claimed = await claimDueDeliveries();
  for (const delivery of claimed) await deliver(delivery);
  return claimed.length;
}

async function runPass() {
  try {
    return await sendDueDeliveries();
  } catch (error) {
    logWorkerError(error);
    return 0;
  }
}

function logWorkerError(error: unknown) {
  logNotificationError({ errorName: errorNameOf(error) });
}

function errorNameOf(error: unknown) {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  return cause instanceof Error ? cause.name : typeof cause;
}

function claimDueDeliveries() {
  return db.transaction(async (tx) => {
    const due = await dueDeliveries(tx);
    if (due.length === 0) return [];

    const lease = await leaseDeliveries(
      tx,
      due.map((delivery) => delivery.id),
    );
    return due.map((delivery): ClaimedDelivery => ({ ...delivery, lease }));
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
        or(isNull(notificationDeliveries.lockedUntil), lte(notificationDeliveries.lockedUntil, sql`now()`)),
      ),
    )
    .orderBy(asc(notificationBatches.sendAfter))
    .limit(batchSize)
    .for("update", { of: notificationDeliveries, skipLocked: true });
}

async function leaseDeliveries(tx: Transaction, ids: string[]) {
  const [{ lease }] = await tx
    .update(notificationDeliveries)
    .set({ lockedUntil: sql`now() + interval '2 minutes'` })
    .where(inArray(notificationDeliveries.id, ids))
    .returning({ lease: sql<string>`${notificationDeliveries.lockedUntil}::text` });
  return lease;
}

function heldBy(delivery: ClaimedDelivery) {
  return and(
    eq(notificationDeliveries.id, delivery.id),
    eq(notificationDeliveries.state, "pending"),
    eq(notificationDeliveries.lockedUntil, sql`${delivery.lease}::timestamptz`),
  );
}

async function deliver(delivery: ClaimedDelivery) {
  try {
    await sendAndRecord(delivery);
  } catch (error) {
    logNotificationError({ deliveryId: delivery.id, errorName: errorNameOf(error) });
    await recordFailure(delivery).catch(() => {});
  }
}

async function sendAndRecord(delivery: ClaimedDelivery) {
  const message = await applyDropChecks(delivery);
  if (!message) return;

  const sent = await send(delivery, message);
  if (!sent) return recordFailure(delivery);

  await db
    .update(notificationDeliveries)
    .set({ state: "sent", providerMessageId: sent.providerMessageId, sentAt: sql`now()` })
    .where(heldBy(delivery));
}

function send(delivery: ClaimedDelivery, { recipient, kept }: { recipient: Recipient; kept: Item[] }) {
  return notificationSenders[delivery.channel](recipient, kept, delivery.id).catch(() => null);
}

function applyDropChecks(delivery: ClaimedDelivery) {
  return db.transaction(async (tx) => {
    if (!(await holdsLease(tx, delivery))) return null;

    const [recipient] = await tx.select().from(members).where(eq(members.id, delivery.recipientId));
    const items = await itemsOf(tx, delivery.batchId);
    const kept = recipient.deactivatedAt === null ? await wantedItems(tx, delivery, items) : [];

    await dropNotifications(
      tx,
      items.filter((item) => !kept.includes(item)).map((item) => item.id),
    );

    if (kept.length === 0) {
      await tx.update(notificationDeliveries).set({ state: "dropped" }).where(heldBy(delivery));
      return null;
    }
    return { recipient, kept };
  });
}

async function holdsLease(tx: Transaction, delivery: ClaimedDelivery) {
  const held = await tx
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(heldBy(delivery))
    .for("update");
  return held.length > 0;
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

async function recordFailure(delivery: ClaimedDelivery) {
  const delayMinutes = retryDelaysMinutes[delivery.attempts];
  if (delayMinutes === undefined) return markFailed(delivery);
  await db
    .update(notificationDeliveries)
    .set({
      attempts: delivery.attempts + 1,
      nextAttemptAt: sql`now() + make_interval(mins => ${delayMinutes})`,
      lockedUntil: null,
    })
    .where(heldBy(delivery));
}

async function markFailed(delivery: ClaimedDelivery) {
  const failed = await db
    .update(notificationDeliveries)
    .set({ state: "failed", attempts: delivery.attempts + 1 })
    .where(heldBy(delivery))
    .returning({ id: notificationDeliveries.id });
  if (failed.length > 0) logNotificationFailure({ channel: delivery.channel, deliveryId: delivery.id });
}