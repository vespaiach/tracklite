import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../server/shared/db";
import { notificationDeliveries, workerHeartbeats } from "../../../server/shared/schema";
import { createMember, createNotificationBatch } from "../../../test/factories";
import { GET } from "./route";

beforeEach(async () => {
  await db.delete(notificationDeliveries).where(eq(notificationDeliveries.state, "pending"));
  await db.delete(workerHeartbeats);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function lastPassWas(interval: string) {
  await db
    .insert(workerHeartbeats)
    .values({ name: "worker", lastPassAt: sql`now() - ${interval}::interval` })
    .onConflictDoUpdate({
      target: workerHeartbeats.name,
      set: { lastPassAt: sql`now() - ${interval}::interval` },
    });
}

async function pendingDelivery({ dueFor, retryIn }: { dueFor: string; retryIn?: string }) {
  const sam = await createMember();
  await createNotificationBatch(
    {
      recipientId: sam.id,
      targetType: "issue",
      targetId: randomUUID(),
      sendAfter: sql`now() - ${dueFor}::interval`,
    },
    retryIn ? { attempts: 1, nextAttemptAt: sql`now() + ${retryIn}::interval` } : {},
  );
}

it("OPS-005.3, OPS-005.2: the worker has never finished a pass, or its last pass was 3 minutes ago → /health/worker returns 503", async () => {
  expect((await GET()).status).toBe(503);

  await lastPassWas("3 minutes");

  expect((await GET()).status).toBe(503);
});

it("OPS-005.4: last pass 10 seconds ago, oldest due delivery waited 11 minutes → /health/worker returns 503", async () => {
  await lastPassWas("10 seconds");
  await pendingDelivery({ dueFor: "11 minutes" });

  const response = await GET();

  expect(response.status).toBe(503);
});

it("OPS-005.5: last pass 10 seconds ago, a delivery waiting for a retry isn't due, and the oldest due delivery waited 1 minute → /health/worker returns 200", async () => {
  await lastPassWas("10 seconds");
  await pendingDelivery({ dueFor: "11 minutes", retryIn: "3 minutes" });

  expect((await GET()).status).toBe(200);

  await pendingDelivery({ dueFor: "1 minute" });
  const response = await GET();

  expect(response.status).toBe(200);
  expect(await response.text()).toBe("ok");
});

it("OPS-005: /health/worker returns 503 when the database doesn't respond", async () => {
  await lastPassWas("10 seconds");
  vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

  const response = await GET();

  expect(response.status).toBe(503);
  expect(await response.text()).toBe("unavailable");
});