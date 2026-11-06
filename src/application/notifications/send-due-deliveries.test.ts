import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { PostgresJsPreparedQuery } from "drizzle-orm/postgres-js/session";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../infrastructure/db";
import { outbox } from "../../infrastructure/email/outbox";
import { notificationSenders } from "../../infrastructure/notifications/channels";
import { deliveryServices } from "../../infrastructure/notifications/services";
import { notificationDeliveries, notifications } from "../../infrastructure/notifications/tables";
import type { Transaction } from "../../infrastructure/transaction";
import {
  assign,
  batchesOf,
  comment,
  dueMentionsFor,
  emailsOf,
  leaseEndsIn,
  mailTo,
  statesOf,
  waitIsOver,
  website,
} from "../../test/deliveries";
import { createMember } from "../../test/factories";
import { spyOnLoggedErrors } from "../../test/log";
import { sendDueDeliveries } from "./send-due-deliveries";

beforeEach(() => {
  outbox.sent = [];
  outbox.failing = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function droppedFlagsOf(member: { id: string }) {
  return db
    .select({ kind: notifications.kind, dropped: notifications.dropped })
    .from(notifications)
    .where(inArray(notifications.batchId, batchesOf(member)))
    .orderBy(asc(notifications.createdAt));
}

async function retryIsDue(member: { id: string }) {
  await db
    .update(notificationDeliveries)
    .set({ nextAttemptAt: sql`now() - interval '1 second'` })
    .where(inArray(notificationDeliveries.batchId, batchesOf(member)));
}

async function sendAllDue() {
  while ((await sendDueDeliveries(deliveryServices)) > 0) {}
}

function fromAnotherConnection<T>(write: (tx: Transaction) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local lock_timeout = '1s'`);
    return write(tx);
  });
}

async function recordingSentFails(deliveryId: string) {
  await db.execute(
    sql.raw(`create function fail_recording_sent() returns trigger language plpgsql as $$
      begin
        if new.state = 'sent' and new.id = '${deliveryId}' then raise exception 'recording failed'; end if;
        return new;
      end $$`),
  );
  await db.execute(
    sql`create trigger fail_recording_sent before update on notification_deliveries for each row execute function fail_recording_sent()`,
  );
}

async function recordingSentWorks() {
  await db.execute(sql`drop trigger if exists fail_recording_sent on notification_deliveries`);
  await db.execute(sql`drop function if exists fail_recording_sent()`);
}

async function dropCheckQueriesOfOnePass() {
  const execute = vi.spyOn(PostgresJsPreparedQuery.prototype, "execute");
  try {
    await sendDueDeliveries(deliveryServices);
    const queries = execute.mock.contexts.map((query) => (query as { queryString: string }).queryString);
    return queries.filter((query) =>
      /^select [\s\S]* from "(members|notifications|issues|projects|mentions)"/.test(query),
    ).length;
  } finally {
    execute.mockRestore();
  }
}

async function stateChangesOf(member: { id: string }) {
  return db
    .select({
      state: notificationDeliveries.state,
      changedJustNow: sql<
        boolean | null
      >`${notificationDeliveries.stateChangedAt} between now() - interval '1 minute' and now()`,
    })
    .from(notificationDeliveries)
    .where(inArray(notificationDeliveries.batchId, batchesOf(member)));
}

it("REQ-045, REQ-053: an email isn't sent before its 2 minutes are up; once due it is sent, and its send time recorded", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);

  await sendAllDue();

  expect(mailTo(sam)).toEqual([]);
  expect(await stateChangesOf(sam)).toEqual([{ state: "pending", changedJustNow: null }]);

  await waitIsOver(sam);
  await sendAllDue();

  expect(mailTo(sam)).toHaveLength(1);
  expect(mailTo(sam)[0].subject).toBe(`[${issueRef}] Fix login button: assigned to you by ${alex.fullName}`);
  expect(await emailsOf(sam)).toEqual([
    expect.objectContaining({
      state: "sent",
      providerMessageId: expect.any(String),
      sentAt: expect.any(Date),
    }),
  ]);
  expect(await stateChangesOf(sam)).toEqual([{ state: "sent", changedJustNow: true }]);
});

it("REQ-045.1: assign + mention within the wait → Sam gets one email covering both", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
  const posted = await comment(issueRef, alex, `@${sam.username} over to you`);
  await waitIsOver(sam);

  await sendAllDue();

  expect(mailTo(sam)).toHaveLength(1);
  expect(mailTo(sam)[0].subject).toBe(`[${issueRef}] Fix login button: 2 updates for you`);
  expect(mailTo(sam)[0].text).toBe(
    [
      `${alex.fullName} assigned ${issueRef} to you in Website.`,
      "",
      `http://localhost:3000/issue/${issueRef}`,
      "",
      "---",
      "",
      `${alex.fullName} mentioned you in a comment on ${issueRef} (Website):`,
      "",
      `@${sam.username} over to you`,
      "",
      `http://localhost:3000/issue/${issueRef}#comment-${posted.id}`,
      "",
      "— Tracklite",
    ].join("\n"),
  );
});

it("REQ-053: a delivery whose notifications are no longer wanted is recorded as dropped, with its time; one still wanted is sent", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const jo = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
  await assign(issueRef, alex, jo);
  await waitIsOver(sam);
  await waitIsOver(jo);

  await sendAllDue();

  expect(mailTo(sam)).toEqual([]);
  expect(await stateChangesOf(sam)).toEqual([{ state: "dropped", changedJustNow: true }]);
  expect(mailTo(jo)).toHaveLength(1);
});

it("REQ-045.8: the first two mentions go out together; the third waits for its own email", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  await comment(issueRef, alex, `@${sam.username} first`);
  await comment(issueRef, alex, `@${sam.username} second`);
  await waitIsOver(sam);
  await comment(issueRef, alex, `@${sam.username} third`);

  await sendAllDue();

  expect(mailTo(sam)).toHaveLength(1);
  expect(mailTo(sam)[0].subject).toBe(`[${issueRef}] Fix login button: 2 updates for you`);
  expect((await emailsOf(sam)).map((email) => email.state)).toEqual(["sent", "pending"]);

  await waitIsOver(sam);
  await sendAllDue();

  expect(mailTo(sam)).toHaveLength(2);
  expect(mailTo(sam)[1].subject).toBe(`[${issueRef}] Fix login button: ${alex.fullName} mentioned you`);
});

it("REQ-045: a notification already dropped isn't sent by a later delivery", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
  await comment(issueRef, alex, `@${sam.username} look`);
  await db
    .update(notifications)
    .set({ dropped: true })
    .where(and(inArray(notifications.batchId, batchesOf(sam)), eq(notifications.kind, "assigned")));
  await waitIsOver(sam);

  await sendAllDue();

  expect(mailTo(sam)).toHaveLength(1);
  expect(mailTo(sam)[0].subject).toBe(`[${issueRef}] Fix login button: ${alex.fullName} mentioned you`);
  expect(await droppedFlagsOf(sam)).toEqual([
    { kind: "assigned", dropped: true },
    { kind: "mentioned", dropped: false },
  ]);
});

it("STD-6, REQ-053: each failed attempt records its retry time; the last records failed with its time, and nothing more is sent; a failed send is sendEmail's to log, so the run logs no delivery-failed line", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
  await waitIsOver(sam);
  outbox.failing = true;
  const loggedErrors = spyOnLoggedErrors();

  await sendAllDue();
  expect(await emailsOf(sam)).toEqual([
    expect.objectContaining({ state: "pending", attempts: 1, retryInSeconds: 60 }),
  ]);
  expect(await stateChangesOf(sam)).toEqual([{ state: "pending", changedJustNow: null }]);

  await retryIsDue(sam);
  await sendAllDue();
  expect(await emailsOf(sam)).toEqual([
    expect.objectContaining({ state: "pending", attempts: 2, retryInSeconds: 240 }),
  ]);

  await retryIsDue(sam);
  await sendAllDue();
  expect(await emailsOf(sam)).toEqual([
    expect.objectContaining({ state: "pending", attempts: 3, retryInSeconds: 600 }),
  ]);

  await retryIsDue(sam);
  await sendAllDue();
  const [email] = await emailsOf(sam);
  expect(email).toEqual(expect.objectContaining({ state: "failed", attempts: 4 }));
  expect(await stateChangesOf(sam)).toEqual([{ state: "failed", changedJustNow: true }]);
  expect(loggedErrors().filter((line) => line.deliveryId === email.id)).toEqual([]);

  outbox.failing = false;
  await retryIsDue(sam);
  await sendAllDue();
  expect(mailTo(sam)).toEqual([]);
});

it("STD-6: a retry that succeeds sends the email", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
  await waitIsOver(sam);
  outbox.failing = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
  await sendAllDue();

  outbox.failing = false;
  await retryIsDue(sam);
  await sendAllDue();

  expect(mailTo(sam)).toHaveLength(1);
  expect(await emailsOf(sam)).toEqual([expect.objectContaining({ state: "sent", attempts: 1 })]);
});

it("REQ-045.6: a bounced email isn't picked up again", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
  await waitIsOver(sam);
  await db
    .update(notificationDeliveries)
    .set({ state: "bounced" })
    .where(inArray(notificationDeliveries.batchId, batchesOf(sam)));

  await sendAllDue();

  expect(mailTo(sam)).toEqual([]);
  expect((await emailsOf(sam)).map((email) => email.state)).toEqual(["bounced"]);
});

it("§1.4: a delivery whose lease has expired is claimed again; one leased by another pass isn't", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const jo = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
  await comment(issueRef, alex, `@${jo.username} look`);
  await waitIsOver(sam);
  await waitIsOver(jo);
  await leaseEndsIn(sam, "-1 second");
  await leaseEndsIn(jo, "1 minute");

  await sendAllDue();

  expect(mailTo(sam)).toHaveLength(1);
  expect((await emailsOf(sam)).map((email) => email.state)).toEqual(["sent"]);
  expect(mailTo(jo)).toEqual([]);
  expect((await emailsOf(jo)).map((email) => email.state)).toEqual(["pending"]);
});

it("OPS-007.6, §1.4: an unexpected error in one delivery logs one delivery-failed line with its id and no recipient, the pass goes on with the others, and that delivery gets a retry", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const jo = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
  await comment(issueRef, alex, `@${jo.username} look`);
  await waitIsOver(sam);
  await waitIsOver(jo);
  const [samEmail] = await emailsOf(sam);
  const loggedErrors = spyOnLoggedErrors();

  await recordingSentFails(samEmail.id);
  try {
    await sendDueDeliveries(deliveryServices);
  } finally {
    await recordingSentWorks();
  }

  expect(await emailsOf(jo)).toEqual([expect.objectContaining({ state: "sent" })]);
  expect(await emailsOf(sam)).toEqual([
    expect.objectContaining({ state: "pending", attempts: 1, retryInSeconds: 60 }),
  ]);
  const lines = loggedErrors();
  expect(lines).toEqual([
    expect.objectContaining({
      source: "outbox",
      event: "delivery-failed",
      deliveryId: samEmail.id,
      channel: "email",
      error: expect.objectContaining({ cause: expect.objectContaining({ name: "PostgresError" }) }),
    }),
  ]);
  expect(JSON.stringify(lines)).not.toContain(sam.email);
});

it("§1.4: no transaction is open while the sender runs", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
  await waitIsOver(sam);
  const [samEmail] = await emailsOf(sam);
  const send = notificationSenders.email;
  let outcome = "";
  vi.spyOn(notificationSenders, "email").mockImplementation(async (...args) => {
    if (args[2] !== samEmail.id) return send(...args);
    outcome = await fromAnotherConnection((tx) =>
      tx
        .update(notificationDeliveries)
        .set({ attempts: sql`${notificationDeliveries.attempts}` })
        .where(eq(notificationDeliveries.id, samEmail.id)),
    ).then(
      () => "updated",
      (error: Error) => String(error.cause),
    );
    return send(...args);
  });

  await sendAllDue();

  expect(outcome).toBe("updated");
  expect((await emailsOf(sam)).map((email) => email.state)).toEqual(["sent"]);
});

it("§1.4: a pass whose lease was taken over doesn't overwrite the newer pass's result", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
  await waitIsOver(sam);
  const send = notificationSenders.email;
  vi.spyOn(notificationSenders, "email").mockImplementation(async (...args) => {
    await fromAnotherConnection(() => leaseEndsIn(sam, "5 minutes"));
    return send(...args);
  });

  await sendDueDeliveries(deliveryServices);

  expect(await emailsOf(sam)).toEqual([expect.objectContaining({ state: "pending", attempts: 0 })]);
});

it("REQ-045: a pass of 10 deliveries runs as many drop-check queries as a pass of 1", async () => {
  await sendAllDue();
  const one = await dueMentionsFor(1);
  const queriesForOne = await dropCheckQueriesOfOnePass();
  const ten = await dueMentionsFor(10);
  const queriesForTen = await dropCheckQueriesOfOnePass();

  expect(queriesForTen).toBe(queriesForOne);
  expect(await statesOf([...one, ...ten])).toEqual(Array(11).fill("sent"));
});