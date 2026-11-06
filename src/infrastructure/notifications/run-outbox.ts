import "server-only";
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { cleanUp } from "../../application/notifications/clean-up";
import { recordNotifications } from "../../application/notifications/record-notifications";
import {
  batchSize,
  emptyTally,
  sendDueDeliveries,
  type Tally,
} from "../../application/notifications/send-due-deliveries";
import { eventRetryInMinutes, type OutboxEvent } from "../../domain/notifications/notification-repository";
import { queueCounts } from "../../queries";
import { db } from "../db";
import { logError, logInfo } from "../log";
import type { Transaction } from "../transaction";
import { drizzleNotificationRepository } from "./drizzle-notification-repository";
import { cleanUpServices, deliveryServices } from "./services";
import { jobRuns, outboxEvents } from "./tables";

type ClaimedEvent = OutboxEvent & { attempts: number };

export async function runOutbox(timeLeft: () => boolean) {
  const tally = emptyTally();
  try {
    await recordRun();
    while (timeLeft() && (await publishNextEvent())) {}
    while (timeLeft() && (await sendDueDeliveries(deliveryServices, tally)) === batchSize) {}
  } catch (error) {
    logError("outbox", "run-failed", error);
    return false;
  }

  if (timeLeft()) await cleanUpHourly().catch((error) => logError("outbox", "cleanup-failed", error));

  await logMetrics(tally).catch((error) => logError("outbox", "metrics-failed", error));
  return true;
}

export function publishNextEvent() {
  return db.transaction(async (tx) => {
    const [event] = await claimDueEvent(tx);
    if (!event) return false;

    await publishOrBackOff(tx, event);
    return true;
  });
}

function recordRun() {
  return db
    .insert(jobRuns)
    .values({ name: "outbox", lastRunAt: sql`now()` })
    .onConflictDoUpdate({ target: jobRuns.name, set: { lastRunAt: sql`now()` } });
}

function claimDueEvent(tx: Transaction): Promise<ClaimedEvent[]> {
  return tx
    .select({
      id: outboxEvents.id,
      type: outboxEvents.type,
      payload: outboxEvents.payload,
      attempts: outboxEvents.attempts,
    })
    .from(outboxEvents)
    .where(and(isNull(outboxEvents.publishedAt), lte(outboxEvents.nextAttemptAt, sql`now()`)))
    .orderBy(asc(outboxEvents.occurredAt))
    .limit(1)
    .for("update", { skipLocked: true });
}

async function publishOrBackOff(tx: Transaction, event: ClaimedEvent) {
  try {
    await tx.transaction(async (savepoint) => {
      await recordNotifications(drizzleNotificationRepository(savepoint), event);

      await savepoint
        .update(outboxEvents)
        .set({ publishedAt: sql`now()` })
        .where(eq(outboxEvents.id, event.id));
    });
  } catch (error) {
    logError("outbox", "event-failed", error, { eventId: event.id, type: event.type });

    await tx
      .update(outboxEvents)
      .set({
        attempts: event.attempts + 1,
        nextAttemptAt: sql`now() + make_interval(mins => ${eventRetryInMinutes(event.attempts)})`,
      })
      .where(eq(outboxEvents.id, event.id));
  }
}

async function cleanUpHourly() {
  if (await claimCleanup()) await cleanUp(cleanUpServices);
}

async function claimCleanup() {
  const claimed = await db
    .insert(jobRuns)
    .values({ name: "cleanup", lastRunAt: sql`now()` })
    .onConflictDoUpdate({
      target: jobRuns.name,
      set: { lastRunAt: sql`now()` },
      setWhere: sql`${jobRuns.lastRunAt} <= now() - interval '1 hour'`,
    })
    .returning({ name: jobRuns.name });
  return claimed.length > 0;
}

async function logMetrics(tally: Tally) {
  const events = await db.$count(outboxEvents, isNull(outboxEvents.publishedAt));
  const queue = await queueCounts();
  logInfo("outbox", "metrics", { events, ...queue, ...tally });
}