import { eq, inArray, isNull, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { recordNotifications } from "../../../../application/notifications/record-notifications";
import { db } from "../../../../infrastructure/db";
import { outbox } from "../../../../infrastructure/email/outbox";
import { type Member, members } from "../../../../infrastructure/identity/tables";
import { updateIssue } from "../../../../application/issues/update-issue";
import { IssueId, Username } from "../../../../domain/shared/identifiers";
import { issueWork } from "../../../../infrastructure/issues/issue-work";
import { notificationSenders } from "../../../../infrastructure/notifications/channels";
import { drizzleNotificationRepository } from "../../../../infrastructure/notifications/drizzle-notification-repository";
import { runOutbox } from "../../../../infrastructure/notifications/run-outbox";
import {
  jobRuns,
  notificationBatches,
  notificationDeliveries,
  notifications,
  outboxEvents,
} from "../../../../infrastructure/notifications/tables";
import {
  assign,
  batchesOf,
  dueMentionsFor,
  emailsOf,
  emptyQueue,
  leaseEndsIn,
  mailTo,
  sendFailsFor,
  statesOf,
  waitIsOver,
  website,
} from "../../../../test/deliveries";
import { createMember } from "../../../../test/factories";
import { spyOnLoggedErrors } from "../../../../test/log";
import { POST } from "./route";

beforeEach(() => {
  outbox.sent = [];
  outbox.failing = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function runWith(authorization?: string) {
  return POST(
    new Request("http://localhost:3000/api/cron/outbox", {
      method: "POST",
      headers: authorization === undefined ? {} : { authorization },
    }),
  );
}

async function run() {
  const response = await runWith(`Bearer ${process.env.CRON_SECRET}`);
  expect(response.status).toBe(204);
}

function eventsFor(member: { id: string }) {
  return db
    .select({
      id: outboxEvents.id,
      type: outboxEvents.type,
      payload: outboxEvents.payload,
      published: sql<boolean>`${outboxEvents.publishedAt} is not null`,
      attempts: outboxEvents.attempts,
      retryInSeconds: sql<number>`round(extract(epoch from ${outboxEvents.nextAttemptAt} - now()))::int`,
    })
    .from(outboxEvents)
    .where(sql`${outboxEvents.payload} @> ${JSON.stringify({ recipientIds: [member.id] })}::jsonb`);
}

function assignWithoutRecording(issueRef: string, by: Member, assignee: Member) {
  return updateIssue(by, issueWork, IssueId.from(issueRef), {
    assignees: [Username.from(assignee.username)],
  });
}

async function recordingFailsFor(recipientId: string) {
  await db.execute(
    sql.raw(`create function fail_recording_notification() returns trigger language plpgsql as $$
      begin
        if new.recipient_id = '${recipientId}' then raise exception 'recording failed'; end if;
        return new;
      end $$`),
  );
  await db.execute(
    sql`create trigger fail_recording_notification before insert on notifications for each row execute function fail_recording_notification()`,
  );
}

async function recordingWorks() {
  await db.execute(sql`drop trigger if exists fail_recording_notification on notifications`);
  await db.execute(sql`drop function if exists fail_recording_notification()`);
}

function lastRunAgeSeconds(name: string) {
  return db
    .select({ ageSeconds: sql<number>`extract(epoch from now() - ${jobRuns.lastRunAt})::float` })
    .from(jobRuns)
    .where(eq(jobRuns.name, name));
}

function metricsLines(log: { mock: { calls: unknown[][] } }) {
  return log.mock.calls
    .map(([line]) => JSON.parse(String(line)))
    .filter((line) => line.source === "outbox" && line.event === "metrics");
}

it("DEC-004, §1.4: a missing or wrong secret gets 401, and nothing runs", async () => {
  await db.delete(jobRuns).where(eq(jobRuns.name, "outbox"));

  expect((await runWith()).status).toBe(401);
  expect((await runWith("Bearer wrong-secret")).status).toBe(401);
  expect((await runWith(String(process.env.CRON_SECRET))).status).toBe(401);

  expect(await lastRunAgeSeconds("outbox")).toEqual([]);
});

it("REQ-044.1, §1.4: a run turns the event into a notification, a run after the wait sends it, and running again sends nothing more; recording the event again adds nothing", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  await assignWithoutRecording(issueRef, alex, sam);

  await run();

  const [event] = await eventsFor(sam);
  expect(event.published).toBe(true);
  expect(mailTo(sam)).toEqual([]);

  await waitIsOver(sam);
  await run();
  await run();

  expect(mailTo(sam)).toHaveLength(1);
  await db.transaction((tx) => recordNotifications(drizzleNotificationRepository(tx), event));
  expect(await db.$count(notifications, eq(notifications.eventId, event.id))).toBe(1);
  expect(await emailsOf(sam)).toEqual([expect.objectContaining({ state: "sent" })]);
});

it("OPS-007.6, §1.4: a failing handler logs event-failed and leaves its event unpublished with a retry; the run goes on with other events, and a later run retries it", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const jo = await createMember();
  const { issueRef } = await website();
  const other = await website();
  await assignWithoutRecording(issueRef, alex, sam);
  await assignWithoutRecording(other.issueRef, alex, jo);
  const loggedErrors = spyOnLoggedErrors();

  await recordingFailsFor(sam.id);
  try {
    await run();
  } finally {
    await recordingWorks();
  }

  const [failed] = await eventsFor(sam);
  expect(failed).toEqual(expect.objectContaining({ published: false, attempts: 1, retryInSeconds: 60 }));
  expect(await db.$count(notificationBatches, eq(notificationBatches.recipientId, sam.id))).toBe(0);
  expect((await eventsFor(jo)).map((event) => event.published)).toEqual([true]);
  expect(loggedErrors()).toEqual([
    expect.objectContaining({
      source: "outbox",
      event: "event-failed",
      eventId: failed.id,
      type: "IssueAssigned",
    }),
  ]);

  await db
    .update(outboxEvents)
    .set({ nextAttemptAt: sql`now() - interval '1 second'` })
    .where(eq(outboxEvents.id, failed.id));
  await run();

  expect((await eventsFor(sam)).map((event) => event.published)).toEqual([true]);
  expect(await db.$count(notificationBatches, eq(notificationBatches.recipientId, sam.id))).toBe(1);
});

it("OPS-005, D-71: every run records the outbox heartbeat with now()", async () => {
  await db
    .insert(jobRuns)
    .values({ name: "outbox", lastRunAt: sql`now() - interval '5 minutes'` })
    .onConflictDoUpdate({ target: jobRuns.name, set: { lastRunAt: sql`now() - interval '5 minutes'` } });

  await run();

  const [heartbeat] = await lastRunAgeSeconds("outbox");
  expect(heartbeat.ageSeconds).toBeLessThan(5);
});

it("DATA-004, D-71: cleanup runs once its hour is up, deleting outbox events published over 30 days ago; within the hour it doesn't run", async () => {
  const sam = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, await createMember(), sam);
  const [event] = await eventsFor(sam);
  await db
    .update(outboxEvents)
    .set({ publishedAt: sql`now() - interval '31 days'` })
    .where(eq(outboxEvents.id, event.id));
  const cleanupWas = (interval: string) =>
    db
      .insert(jobRuns)
      .values({ name: "cleanup", lastRunAt: sql`now() - ${interval}::interval` })
      .onConflictDoUpdate({ target: jobRuns.name, set: { lastRunAt: sql`now() - ${interval}::interval` } });

  await cleanupWas("59 minutes");
  await run();

  expect(await eventsFor(sam)).toHaveLength(1);

  await cleanupWas("61 minutes");
  await run();

  expect(await eventsFor(sam)).toEqual([]);
  const [cleanup] = await lastRunAgeSeconds("cleanup");
  expect(cleanup.ageSeconds).toBeLessThan(5);
});

it("§1.4: a full batch is followed at once by another pass", async () => {
  const recipients = await dueMentionsFor(11);

  await run();

  expect(await statesOf(recipients)).toEqual(Array(11).fill("sent"));
});

it("§1.4: when time is up, the run finishes the deliveries it claimed and claims no more", async () => {
  const recipients = await dueMentionsFor(11);
  const send = notificationSenders.email;
  let timeIsUp = false;
  vi.spyOn(notificationSenders, "email").mockImplementationOnce(async (...args) => {
    timeIsUp = true;
    return send(...args);
  });

  await runOutbox(() => !timeIsUp);

  const states = await statesOf(recipients);
  expect(states.filter((state) => state === "sent")).toHaveLength(10);
  expect(states.filter((state) => state === "pending")).toHaveLength(1);
});

it("§1.4: an error outside any event or delivery logs run-failed and answers 500", async () => {
  const connectionRefused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
    code: "ECONNREFUSED",
  });
  vi.spyOn(db, "transaction").mockRejectedValueOnce(connectionRefused);
  const loggedErrors = spyOnLoggedErrors();

  const response = await runWith(`Bearer ${process.env.CRON_SECRET}`);

  expect(response.status).toBe(500);
  expect(loggedErrors()).toEqual([
    expect.objectContaining({
      source: "outbox",
      event: "run-failed",
      error: expect.objectContaining({ code: "ECONNREFUSED" }),
    }),
  ]);
});

it("§1.4: the metrics line holds the outbox and queue counts and this run's delivery counts, and no recipient or text", async () => {
  await emptyQueue();
  await db.delete(outboxEvents).where(isNull(outboxEvents.publishedAt));
  const alex = await createMember();
  const [sam, jo, kim, lee, mia] = await Promise.all(Array.from({ length: 5 }, () => createMember()));
  const issueRefs = await Promise.all(Array.from({ length: 5 }, async () => (await website()).issueRef));
  for (const [index, recipient] of [sam, jo, kim, lee, mia].entries())
    await assign(issueRefs[index], alex, recipient);
  await db.update(members).set({ deactivatedAt: sql`now()` }).where(eq(members.id, jo.id));
  for (const recipient of [sam, jo, kim, mia]) await waitIsOver(recipient);
  const [kimEmail] = await emailsOf(kim);
  await db
    .update(notificationDeliveries)
    .set({ attempts: 3 })
    .where(eq(notificationDeliveries.id, kimEmail.id));
  sendFailsFor(kimEmail.id);
  await db
    .update(notificationBatches)
    .set({ sendAfter: sql`now() - interval '3 minutes'` })
    .where(inArray(notificationBatches.id, batchesOf(mia)));
  await leaseEndsIn(mia, "1 minute");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});

  await run();

  const lines = metricsLines(log);
  expect(lines).toEqual([
    {
      level: "info",
      time: expect.any(String),
      source: "outbox",
      event: "metrics",
      events: 0,
      pending: 2,
      due: 1,
      oldestDueSeconds: expect.any(Number),
      sent: 1,
      failed: 1,
      dropped: 1,
    },
  ]);
  expect(lines[0].oldestDueSeconds).toBeGreaterThanOrEqual(180);
  expect(lines[0].oldestDueSeconds).toBeLessThan(190);
  const text = JSON.stringify(lines);
  for (const member of [sam, jo, kim, lee, mia]) {
    expect(text).not.toContain(member.email);
    expect(text).not.toContain(member.username);
  }
  expect(text).not.toContain("Fix login button");
});