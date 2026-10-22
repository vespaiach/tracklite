import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NotificationStats } from "../../../contract";
import { db } from "../../../server/db";
import { notificationDeliveries, notifications, workerHeartbeats } from "../../../server/schema";
import { createMember, createNotificationBatch } from "../../../test/factories";
import { signedInAdmin } from "../../../test/invitations";
import { GET } from "./route";

type FinishedState = "sent" | "dropped" | "failed" | "bounced";
type Target = { type: "issue" | "project"; issueRef: string | null; projectKey: string };

const webIssue: Target = { type: "issue", issueRef: "WEB-42", projectKey: "WEB" };

beforeEach(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  await db.delete(notificationDeliveries);
  await db.delete(workerHeartbeats);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function statsWith(cookie: string) {
  return GET(new Request("http://localhost:3000/api/notification-stats", { headers: { Cookie: cookie } }));
}

async function statsAsAdmin(): Promise<NotificationStats> {
  const { cookie } = await signedInAdmin();
  const response = await statsWith(cookie);
  expect(response.status).toBe(200);
  return response.json();
}

async function lastPassWas(interval: string) {
  const [heartbeat] = await db
    .insert(workerHeartbeats)
    .values({ name: "worker", lastPassAt: sql`now() - ${interval}::interval` })
    .returning();
  return heartbeat.lastPassAt;
}

async function pendingDelivery(sendAfter: string) {
  const sam = await createMember();
  await createNotificationBatch({
    recipientId: sam.id,
    targetType: "issue",
    targetId: randomUUID(),
    sendAfter: sql`now() + ${sendAfter}::interval`,
  });
}

async function finishedDelivery(
  state: FinishedState,
  { ago = "1 hour", attempts = 0, recipientId = "", target = webIssue } = {},
) {
  const recipient = recipientId || (await createMember()).id;
  const { batch, delivery } = await createNotificationBatch(
    {
      recipientId: recipient,
      targetType: target.type,
      targetId: randomUUID(),
      sendAfter: sql`now() - interval '3 days'`,
    },
    { state, attempts, stateChangedAt: sql`now() - ${ago}::interval` },
  );
  return { batchId: batch.id, deliveryId: delivery.id, recipientId: recipient };
}

async function notificationIn(
  batchId: string,
  target: Target,
  excerpt = "Looks good to me",
  createdAgo = "1 hour",
) {
  const actor = await createMember();
  await db.insert(notifications).values({
    batchId,
    kind: "mentioned",
    actorId: actor.id,
    issueRef: target.issueRef,
    issueTitle: target.issueRef ? "Fix login button" : null,
    projectName: "Website",
    projectKey: target.projectKey,
    linkPath: target.issueRef ? `/issue/${target.issueRef}` : `/project/${target.projectKey}`,
    excerpt,
    createdAt: sql`now() - ${createdAgo}::interval`,
  });
}

async function many(count: number, state: FinishedState, ago = "1 hour") {
  for (let i = 0; i < count; i++) await finishedDelivery(state, { ago });
}

it("REQ-053.1: last pass 4 seconds ago, 3 pending, 1 due for 40 seconds → last pass time, 3 pending, 1 due, 40 seconds", async () => {
  const lastPassAt = await lastPassWas("4 seconds");
  await pendingDelivery("-40 seconds");
  await pendingDelivery("1 minute");
  await pendingDelivery("2 minutes");

  const stats = await statsAsAdmin();

  expect(stats.workerLastPassAt).toBe(lastPassAt.toISOString());
  expect(stats.queue).toEqual({ pending: 3, due: 1, oldestDueSeconds: 40 });
});

it("REQ-053.2: 12 sent, 2 dropped, 1 failed and 1 bounced in 24 hours, 1 failed 2 days ago → the Email row shows 12, 2, 1, 1", async () => {
  await many(12, "sent");
  await many(2, "dropped");
  await many(1, "failed");
  await many(1, "bounced");
  await many(1, "failed", "2 days");

  const stats = await statsAsAdmin();

  expect(stats.channels).toEqual([{ channel: "email", sent: 12, dropped: 2, failed: 1, bounced: 1 }]);
});

it("REQ-053.3: Sam's email about WEB-42 failed after 4 attempts → sam, Email, WEB-42, 4 and when; no email address or excerpt", async () => {
  const sam = await createMember({ fullName: "Sam Lee" });
  const failed = await finishedDelivery("failed", { ago: "5 minutes", attempts: 4, recipientId: sam.id });
  await notificationIn(failed.batchId, webIssue, "Can you check the login redirect?");
  const [stored] = await db
    .select({ stateChangedAt: notificationDeliveries.stateChangedAt })
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.id, failed.deliveryId));
  const { cookie } = await signedInAdmin();

  const response = await statsWith(cookie);
  const body = await response.text();

  expect(JSON.parse(body).recentProblems).toEqual([
    {
      id: failed.deliveryId,
      username: sam.username,
      channel: "email",
      target: "WEB-42",
      state: "failed",
      attempts: 4,
      at: stored.stateChangedAt?.toISOString(),
    },
  ]);
  expect(body).not.toContain(sam.email);
  expect(body).not.toContain("Can you check the login redirect?");
});

it("REQ-053.3: a bounced email counts its successful send as an attempt", async () => {
  const bounced = await finishedDelivery("bounced", { attempts: 1 });
  await notificationIn(bounced.batchId, webIssue);

  const stats = await statsAsAdmin();

  expect(stats.recentProblems).toEqual([expect.objectContaining({ state: "bounced", attempts: 2 })]);
});

it("REQ-053.3: a failed project notification shows the project key of the batch's newest notification", async () => {
  const failed = await finishedDelivery("failed", {
    target: { type: "project", issueRef: null, projectKey: "WEB" },
  });
  await notificationIn(
    failed.batchId,
    { type: "project", issueRef: null, projectKey: "WEB" },
    "",
    "10 minutes",
  );
  await notificationIn(
    failed.batchId,
    { type: "project", issueRef: null, projectKey: "SITE" },
    "",
    "5 minutes",
  );

  const stats = await statsAsAdmin();

  expect(stats.recentProblems).toEqual([expect.objectContaining({ target: "SITE" })]);
});

it("REQ-053.4: 25 deliveries failed or bounced → the 20 most recent are listed, newest first", async () => {
  const ids: string[] = [];
  for (let minutes = 1; minutes <= 25; minutes++) {
    const { batchId, deliveryId } = await finishedDelivery(minutes % 2 ? "failed" : "bounced", {
      ago: `${minutes} minutes`,
    });
    await notificationIn(batchId, webIssue);
    ids.push(deliveryId);
  }

  const stats = await statsAsAdmin();

  expect(stats.recentProblems.map((problem) => problem.id)).toEqual(ids.slice(0, 20));
});

it("REQ-053: a failed delivery the previous release wrote without a state change time isn't listed", async () => {
  const listed = await finishedDelivery("failed");
  await notificationIn(listed.batchId, webIssue);
  const unknown = await finishedDelivery("failed");
  await notificationIn(unknown.batchId, webIssue);
  await db
    .update(notificationDeliveries)
    .set({ stateChangedAt: null })
    .where(eq(notificationDeliveries.id, unknown.deliveryId));

  const stats = await statsAsAdmin();

  expect(stats.recentProblems.map((problem) => problem.id)).toEqual([listed.deliveryId]);
});

it("REQ-053.5, REQ-053.6: the worker has never run and nothing has failed or bounced → no last pass time and an empty recent list", async () => {
  await many(2, "sent");

  const stats = await statsAsAdmin();

  expect(stats.workerLastPassAt).toBeNull();
  expect(stats.recentProblems).toEqual([]);
  expect(stats.channels).toEqual([{ channel: "email", sent: 2, dropped: 0, failed: 0, bounced: 0 }]);
});