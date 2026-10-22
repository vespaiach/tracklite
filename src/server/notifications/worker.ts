import "server-only";
import { setTimeout as sleep } from "node:timers/promises";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { deleteExpiredRows } from "./cleanup";
import { db } from "../shared/db";
import type { Transaction } from "../shared/transaction";
import { logNotificationError, logNotificationFailure, logWorkerMetrics } from "../shared/log";
import { notificationSenders, type Recipient } from "./notification-channels";
import { dueAt, queueCounts } from "./notification-queue";
import { issues } from "../issues/tables";
import { members } from "../identity";
import {
  mentions,
  notificationBatches,
  notificationDeliveries,
  notifications,
  workerHeartbeats,
} from "./tables";
import { projects } from "../projects/tables";

type DueDelivery = Awaited<ReturnType<typeof dueDeliveries>>[number];
type ClaimedDelivery = DueDelivery & { lease: string };
type Item = Awaited<ReturnType<typeof itemsOf>>[number];
type DropChecks = Awaited<ReturnType<typeof loadDropChecks>>;
type Outcome = "sent" | "failed" | "dropped";
type Tally = Record<Outcome, number>;

const batchSize = 10;
const pollIntervalMs = 5_000;
const retryDelaysMinutes = [1, 4, 10];
const cleanupIntervalMs = 60 * 60_000;
const metricsIntervalMs = 60_000;

export async function runWorker({ signal }: { signal: AbortSignal }) {
  let nextCleanupAt = 0;
  let nextMetricsAt = 0;
  const tally = emptyTally();
  do {
    const claimed = await runPass(tally);

    if (performance.now() >= nextMetricsAt) {
      await logMetrics(tally).catch(logWorkerError);
      nextMetricsAt = performance.now() + metricsIntervalMs;
    }

    if (performance.now() >= nextCleanupAt) {
      await deleteExpiredRows().catch(logWorkerError);
      nextCleanupAt = performance.now() + cleanupIntervalMs;
    }

    if (claimed < batchSize) await sleep(pollIntervalMs, undefined, { signal }).catch(() => {});
  } while (!signal.aborted);
}

export async function sendDueDeliveries(tally = emptyTally()) {
  const claimed = await claimDueDeliveries();
  if (claimed.length === 0) return 0;

  const checks = await loadDropChecks(claimed);
  for (const delivery of claimed) {
    const outcome = await deliver(delivery, checks);
    if (outcome) tally[outcome] += 1;
  }
  return claimed.length;
}

function emptyTally(): Tally {
  return { sent: 0, failed: 0, dropped: 0 };
}

async function runPass(tally: Tally) {
  try {
    await recordHeartbeat();
    return await sendDueDeliveries(tally);
  } catch (error) {
    logWorkerError(error);
    return 0;
  }
}

function recordHeartbeat() {
  return db
    .insert(workerHeartbeats)
    .values({ name: "worker", lastPassAt: sql`now()` })
    .onConflictDoUpdate({ target: workerHeartbeats.name, set: { lastPassAt: sql`now()` } });
}

async function logMetrics(tally: Tally) {
  const queue = await queueCounts();
  logWorkerMetrics({ ...queue, ...tally });
  Object.assign(tally, emptyTally());
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
        lte(dueAt, sql`now()`),
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

async function deliver(delivery: ClaimedDelivery, checks: DropChecks) {
  try {
    return await sendAndRecord(delivery, checks);
  } catch (error) {
    logNotificationError({ deliveryId: delivery.id, errorName: errorNameOf(error) });
    return await recordFailure(delivery).catch(() => null);
  }
}

async function sendAndRecord(delivery: ClaimedDelivery, checks: DropChecks): Promise<Outcome | null> {
  const message = await applyDropChecks(delivery, checks);
  if (message === null || message === "dropped") return message;

  const sent = await send(delivery, message);
  if (!sent) return recordFailure(delivery);

  const recorded = await db
    .update(notificationDeliveries)
    .set({
      state: "sent",
      providerMessageId: sent.providerMessageId,
      sentAt: sql`now()`,
      stateChangedAt: sql`now()`,
    })
    .where(heldBy(delivery))
    .returning({ id: notificationDeliveries.id });
  return recorded.length > 0 ? "sent" : null;
}

function send(delivery: ClaimedDelivery, { recipient, kept }: { recipient: Recipient; kept: Item[] }) {
  return notificationSenders[delivery.channel](recipient, kept, delivery.id).catch(() => null);
}

async function loadDropChecks(claimed: ClaimedDelivery[]) {
  const recipientIds = unique(claimed.map((delivery) => delivery.recipientId));
  const issueIds = targetIdsOf(claimed, "issue");
  const projectIds = targetIdsOf(claimed, "project");

  const recipients = await db.select().from(members).where(inArray(members.id, recipientIds));
  const items = await itemsOf(unique(claimed.map((delivery) => delivery.batchId)));
  const existingIssues = await db
    .select({ id: issues.id, assigneeId: issues.assigneeId })
    .from(issues)
    .where(inArray(issues.id, issueIds));
  const existingProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(inArray(projects.id, projectIds));
  const commentIds = unique(items.flatMap((item) => (item.commentId ? [item.commentId] : [])));
  const mentioned = await mentionsOf(recipientIds, { issueIds, projectIds, commentIds });

  return {
    recipients: new Map(recipients.map((recipient) => [recipient.id, recipient])),
    items,
    assigneeOfIssue: new Map(existingIssues.map((issue) => [issue.id, issue.assigneeId])),
    existingProjectIds: new Set(existingProjects.map((project) => project.id)),
    mentionKeys: new Set(
      mentioned.map((mention) =>
        mentionKey(mention.memberId, mention.commentId ?? mention.issueId ?? mention.projectId),
      ),
    ),
  };
}

function unique(ids: string[]) {
  return [...new Set(ids)];
}

function targetIdsOf(claimed: ClaimedDelivery[], targetType: DueDelivery["targetType"]) {
  return unique(
    claimed.filter((delivery) => delivery.targetType === targetType).map((delivery) => delivery.targetId),
  );
}

function itemsOf(batchIds: string[]) {
  return db
    .select({
      id: notifications.id,
      batchId: notifications.batchId,
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
    .where(and(inArray(notifications.batchId, batchIds), eq(notifications.dropped, false)))
    .orderBy(asc(notifications.createdAt), asc(notifications.id));
}

function mentionsOf(
  recipientIds: string[],
  sources: { issueIds: string[]; projectIds: string[]; commentIds: string[] },
) {
  return db
    .select({
      memberId: mentions.memberId,
      issueId: mentions.issueId,
      projectId: mentions.projectId,
      commentId: mentions.commentId,
    })
    .from(mentions)
    .where(
      and(
        inArray(mentions.memberId, recipientIds),
        or(
          inArray(mentions.issueId, sources.issueIds),
          inArray(mentions.projectId, sources.projectIds),
          inArray(mentions.commentId, sources.commentIds),
        ),
      ),
    );
}

function mentionKey(memberId: string, sourceId: string | null) {
  return `${memberId}:${sourceId}`;
}

function applyDropChecks(delivery: ClaimedDelivery, checks: DropChecks) {
  const { recipient, kept, droppedIds } = checkedMessage(delivery, checks);

  return db.transaction(async (tx) => {
    if (!(await holdsLease(tx, delivery))) return null;

    await dropNotifications(tx, droppedIds);

    if (!recipient || kept.length === 0) {
      await tx
        .update(notificationDeliveries)
        .set({ state: "dropped", stateChangedAt: sql`now()` })
        .where(heldBy(delivery));
      return "dropped" as const;
    }
    return { recipient, kept };
  });
}

function checkedMessage(delivery: ClaimedDelivery, checks: DropChecks) {
  const recipient = checks.recipients.get(delivery.recipientId);
  const items = checks.items.filter((item) => item.batchId === delivery.batchId);

  const kept =
    recipient?.deactivatedAt === null ? items.filter((item) => stillWanted(checks, delivery, item)) : [];
  const droppedIds = items.filter((item) => !kept.includes(item)).map((item) => item.id);
  return { recipient, kept, droppedIds };
}

function stillWanted(checks: DropChecks, delivery: DueDelivery, item: Item) {
  if (delivery.targetType === "project") {
    if (!checks.existingProjectIds.has(delivery.targetId)) return true;
  } else {
    if (!checks.assigneeOfIssue.has(delivery.targetId)) return true;
    if (item.kind === "assigned")
      return checks.assigneeOfIssue.get(delivery.targetId) === delivery.recipientId;
  }
  return checks.mentionKeys.has(mentionKey(delivery.recipientId, item.commentId ?? delivery.targetId));
}

async function holdsLease(tx: Transaction, delivery: ClaimedDelivery) {
  const held = await tx
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(heldBy(delivery))
    .for("update");
  return held.length > 0;
}

async function dropNotifications(tx: Transaction, ids: string[]) {
  if (ids.length === 0) return;
  await tx.update(notifications).set({ dropped: true }).where(inArray(notifications.id, ids));
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
  return null;
}

async function markFailed(delivery: ClaimedDelivery) {
  const failed = await db
    .update(notificationDeliveries)
    .set({ state: "failed", attempts: delivery.attempts + 1, stateChangedAt: sql`now()` })
    .where(heldBy(delivery))
    .returning({ id: notificationDeliveries.id });
  if (failed.length === 0) return null;

  logNotificationFailure({ channel: delivery.channel, deliveryId: delivery.id });
  return "failed" as const;
}