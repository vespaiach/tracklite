import { randomUUID } from "node:crypto";
import { eq, isNull, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../infrastructure/db";
import { jobRuns, notificationDeliveries, outboxEvents } from "../../../infrastructure/notifications/tables";
import { createMember, createNotificationBatch } from "../../../test/factories";
import { GET } from "./route";

beforeEach(async () => {
  await db.delete(notificationDeliveries).where(eq(notificationDeliveries.state, "pending"));
  await db.delete(jobRuns);
  await db.delete(outboxEvents).where(isNull(outboxEvents.publishedAt));
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function lastRunWas(interval: string) {
  await db
    .insert(jobRuns)
    .values({ name: "outbox", lastRunAt: sql`now() - ${interval}::interval` })
    .onConflictDoUpdate({
      target: jobRuns.name,
      set: { lastRunAt: sql`now() - ${interval}::interval` },
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

it("OPS-005.3, OPS-005.2: the outbox has never run, or its last run was 3 minutes ago → /health/worker returns 503", async () => {
  expect((await GET()).status).toBe(503);

  await lastRunWas("3 minutes");

  expect((await GET()).status).toBe(503);
});

it("OPS-005.4: outbox ran 10 seconds ago, oldest due delivery waited 11 minutes → /health/worker returns 503", async () => {
  await lastRunWas("10 seconds");
  await pendingDelivery({ dueFor: "11 minutes" });

  const response = await GET();

  expect(response.status).toBe(503);
});

it("OPS-005.5: outbox ran 10 seconds ago, a delivery waiting for a retry isn't due, and the oldest due delivery waited 1 minute → /health/worker returns 200", async () => {
  await lastRunWas("10 seconds");
  await pendingDelivery({ dueFor: "11 minutes", retryIn: "3 minutes" });

  expect((await GET()).status).toBe(200);

  await pendingDelivery({ dueFor: "1 minute" });
  const response = await GET();

  expect(response.status).toBe(200);
  expect(await response.text()).toBe("ok");
});

async function unpublishedEvent(occurredAgo: string) {
  const sam = await createMember();
  await db.insert(outboxEvents).values({
    type: "IssueAssigned",
    occurredAt: sql`now() - ${occurredAgo}::interval`,
    nextAttemptAt: sql`now() + interval '1 hour'`,
    attempts: 4,
    payload: {
      kind: "assigned",
      actorId: sam.id,
      commentId: null,
      recipientIds: [sam.id],
      snapshot: {
        targetType: "issue",
        targetId: randomUUID(),
        issueRef: "WEB-42",
        issueTitle: "Fix login button",
        projectName: "Website",
        projectKey: "WEB",
        linkPath: "/issue/WEB-42",
        excerpt: "",
      },
    },
  });
}

it("OPS-005.6: the outbox ran 10 seconds ago, but an event recorded 11 minutes ago still hasn't become notifications → /health/worker returns 503; one recorded 1 minute ago doesn't count", async () => {
  await lastRunWas("10 seconds");
  await unpublishedEvent("1 minute");

  expect((await GET()).status).toBe(200);

  await unpublishedEvent("11 minutes");

  expect((await GET()).status).toBe(503);
});

it("OPS-005: /health/worker returns 503 when the database doesn't respond", async () => {
  await lastRunWas("10 seconds");
  vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

  const response = await GET();

  expect(response.status).toBe(503);
  expect(await response.text()).toBe("unavailable");
});