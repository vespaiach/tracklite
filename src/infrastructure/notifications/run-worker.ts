import "server-only";
import { setTimeout as sleep } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { cleanUp } from "../../application/notifications/clean-up";
import {
  batchSize,
  emptyTally,
  sendDueDeliveries,
  type Tally,
} from "../../application/notifications/send-due-deliveries";
import { queueCounts } from "../../queries";
import { db } from "../db";
import { logError, logInfo } from "../log";
import { cleanUpServices, deliveryServices } from "./services";
import { workerHeartbeats } from "./tables";

const pollIntervalMs = 5_000;
const cleanupIntervalMs = 60 * 60_000;
const metricsIntervalMs = 60_000;

export async function runWorker({ signal }: { signal: AbortSignal }) {
  let nextCleanupAt = 0;
  let nextMetricsAt = 0;
  const tally = emptyTally();
  do {
    const claimed = await runPass(tally);

    if (performance.now() >= nextMetricsAt) {
      await logMetrics(tally).catch((error) => logError("worker", "metrics-failed", error));
      nextMetricsAt = performance.now() + metricsIntervalMs;
    }

    if (performance.now() >= nextCleanupAt) {
      await cleanUp(cleanUpServices).catch((error) => logError("worker", "cleanup-failed", error));
      nextCleanupAt = performance.now() + cleanupIntervalMs;
    }

    if (claimed < batchSize) await sleep(pollIntervalMs, undefined, { signal }).catch(() => {});
  } while (!signal.aborted);
}

async function runPass(tally: Tally) {
  try {
    await recordHeartbeat();
    return await sendDueDeliveries(deliveryServices, tally);
  } catch (error) {
    logError("worker", "pass-failed", error);
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
  logInfo("worker", "metrics", { ...queue, ...tally });
  Object.assign(tally, emptyTally());
}