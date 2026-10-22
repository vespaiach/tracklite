import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { PostgresJsPreparedQuery } from "drizzle-orm/postgres-js/session";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createIssue, createMember, createProject } from "../test/factories";
import { deleteComment, editComment, postIssueComment } from "./comments";
import { db } from "./shared/db";
import { outbox } from "./shared/email/outbox";
import type { Transaction } from "./shared/transaction";
import { updateIssue } from "./issues";
import { notificationSenders } from "./notification-channels";
import {
  issues,
  members,
  notificationBatches,
  notificationDeliveries,
  notifications,
  workerHeartbeats,
} from "./shared/schema";
import type { Member } from "./identity";
import { runWorker, sendDueDeliveries } from "./worker";

beforeEach(() => {
  outbox.sent = [];
  outbox.failing = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function website() {
  const project = await createProject({ name: "Website" });
  const issue = await createIssue(project.id);
  await db.update(issues).set({ title: "Fix login button" }).where(eq(issues.id, issue.id));
  return { project, issue, issueRef: `${project.key}-${issue.number}` };
}

function assign(issueRef: string, by: Member, assignee: Member | null) {
  return updateIssue(by, issueRef, { assignee: assignee?.username ?? null });
}

async function comment(issueRef: string, by: Member, body: string) {
  const { comment } = await postIssueComment(by, issueRef, { requestId: randomUUID(), body });
  return comment;
}

function batchesOf(member: { id: string }) {
  return db
    .select({ id: notificationBatches.id })
    .from(notificationBatches)
    .where(eq(notificationBatches.recipientId, member.id));
}

function emailsOf(member: { id: string }) {
  return db
    .select({
      id: notificationDeliveries.id,
      state: notificationDeliveries.state,
      attempts: notificationDeliveries.attempts,
      retryInSeconds: sql<
        number | null
      >`round(extract(epoch from ${notificationDeliveries.nextAttemptAt} - now()))::int`,
      providerMessageId: notificationDeliveries.providerMessageId,
      sentAt: notificationDeliveries.sentAt,
    })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.channel, "email"),
        inArray(notificationDeliveries.batchId, batchesOf(member)),
      ),
    )
    .orderBy(asc(notificationDeliveries.createdAt));
}

function droppedFlagsOf(member: { id: string }) {
  return db
    .select({ kind: notifications.kind, dropped: notifications.dropped })
    .from(notifications)
    .where(inArray(notifications.batchId, batchesOf(member)))
    .orderBy(asc(notifications.createdAt));
}

async function waitIsOver(member: { id: string }) {
  await db
    .update(notificationBatches)
    .set({ sendAfter: sql`now() - interval '1 second'` })
    .where(eq(notificationBatches.recipientId, member.id));
}

async function retryIsDue(member: { id: string }) {
  await db
    .update(notificationDeliveries)
    .set({ nextAttemptAt: sql`now() - interval '1 second'` })
    .where(inArray(notificationDeliveries.batchId, batchesOf(member)));
}

function mailTo(member: { email: string }) {
  return outbox.sent.filter((email) => email.to === member.email);
}

async function sendAllDue() {
  while ((await sendDueDeliveries()) > 0) {}
}

async function leaseEndsIn(member: { id: string }, interval: string) {
  await db.execute(
    sql`update ${notificationDeliveries} set locked_until = now() + ${interval}::interval where ${inArray(notificationDeliveries.batchId, batchesOf(member))}`,
  );
}

async function dueMentionsFor(count: number) {
  const alex = await createMember();
  const recipients = await Promise.all(Array.from({ length: count }, () => createMember()));
  const { issueRef } = await website();

  await comment(issueRef, alex, recipients.map((recipient) => `@${recipient.username}`).join(" "));
  for (const recipient of recipients) await waitIsOver(recipient);

  return recipients;
}

async function statesOf(recipients: { id: string }[]) {
  const emails = await Promise.all(recipients.map(emailsOf));
  return emails.flat().map((email) => email.state);
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
    await sendDueDeliveries();
    const queries = execute.mock.contexts.map((query) => (query as { queryString: string }).queryString);
    return queries.filter((query) =>
      /^select [\s\S]* from "(members|notifications|issues|projects|mentions)"/.test(query),
    ).length;
  } finally {
    execute.mockRestore();
  }
}

function logLines(log: { mock: { calls: unknown[][] } }) {
  return log.mock.calls.map(([line]) => JSON.parse(String(line)));
}

function workerLines(log: { mock: { calls: unknown[][] } }) {
  return logLines(log).filter((line) => line.event === "worker");
}

async function emptyQueue() {
  await db.delete(notificationDeliveries).where(eq(notificationDeliveries.state, "pending"));
}

async function onePass() {
  const stop = new AbortController();
  stop.abort();
  await runWorker({ signal: stop.signal });
}

async function sendFailsFor(deliveryId: string) {
  const send = notificationSenders.email;
  vi.spyOn(notificationSenders, "email").mockImplementation(async (...args) => {
    if (args[2] === deliveryId) throw new Error("provider down");
    return send(...args);
  });
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

it("REQ-045.2, REQ-053: reassigned to Jo during the wait → Sam's delivery is dropped, with the time recorded; Jo gets one email", async () => {
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

it("REQ-045.3, REQ-045.4, REQ-045.5: a mention edited out, a comment deleted, or the recipient deactivated during the wait → dropped, no email", async () => {
  const alex = await createMember();
  const editedOut = await createMember();
  const deletedFor = await createMember();
  const deactivated = await createMember();
  const { issueRef } = await website();
  const edited = await comment(issueRef, alex, `@${editedOut.username} look`);
  await editComment(alex, edited.id, { body: "look", version: 0 });
  const deleted = await comment(issueRef, alex, `@${deletedFor.username} look`);
  await deleteComment(alex, deleted.id);
  await assign(issueRef, alex, deactivated);
  await db.update(members).set({ deactivatedAt: sql`now()` }).where(eq(members.id, deactivated.id));
  for (const recipient of [editedOut, deletedFor, deactivated]) await waitIsOver(recipient);

  await sendAllDue();

  for (const recipient of [editedOut, deletedFor, deactivated]) {
    expect(mailTo(recipient)).toEqual([]);
    expect((await emailsOf(recipient)).map((email) => email.state)).toEqual(["dropped"]);
  }
});

it("REQ-045.7: WEB-42 deleted during the wait → Sam still gets the email", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issue, issueRef } = await website();
  await assign(issueRef, alex, sam);
  await comment(issueRef, alex, `@${sam.username} look`);
  await db.delete(issues).where(eq(issues.id, issue.id));
  await waitIsOver(sam);

  await sendAllDue();

  expect(mailTo(sam)).toHaveLength(1);
  expect(mailTo(sam)[0].subject).toBe(`[${issueRef}] Fix login button: 2 updates for you`);
  expect(mailTo(sam)[0].text).toContain(
    `${alex.fullName} assigned ${issueRef} to you in Website.\n\nhttp://localhost:3000/issue/${issueRef}\n`,
  );
  expect((await emailsOf(sam)).map((email) => email.state)).toEqual(["sent"]);
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

it("REQ-045: one notification dropped, another kept → the email is sent with the kept one only", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const jo = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
  await comment(issueRef, alex, `@${sam.username} look`);
  await assign(issueRef, alex, jo);
  await waitIsOver(sam);

  await sendAllDue();

  expect(mailTo(sam)).toHaveLength(1);
  expect(mailTo(sam)[0].subject).toBe(`[${issueRef}] Fix login button: ${alex.fullName} mentioned you`);
  expect(await droppedFlagsOf(sam)).toEqual([
    { kind: "assigned", dropped: true },
    { kind: "mentioned", dropped: false },
  ]);
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

it("STD-6, REQ-053: a failed send is retried after 1, then 4, then 10 minutes; after the third retry fails it is failed, logged once without the address, its time recorded, and nothing more is sent", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
  await waitIsOver(sam);
  outbox.failing = true;
  const log = vi.spyOn(console, "log").mockImplementation(() => {});

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
  const failures = logLines(log).filter(
    (line) => line.event === "notification" && line.deliveryId === email.id,
  );
  expect(failures).toEqual([expect.objectContaining({ level: "error", deliveryId: email.id })]);
  expect(JSON.stringify(failures)).not.toContain(sam.email);

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
  vi.spyOn(console, "log").mockImplementation(() => {});
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

it("§1.4: an unexpected error in one delivery doesn't stop the others, and that delivery gets a retry", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const jo = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
  await comment(issueRef, alex, `@${jo.username} look`);
  await waitIsOver(sam);
  await waitIsOver(jo);
  const [samEmail] = await emailsOf(sam);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});

  await recordingSentFails(samEmail.id);
  try {
    await sendDueDeliveries();
  } finally {
    await recordingSentWorks();
  }

  expect(await emailsOf(jo)).toEqual([expect.objectContaining({ state: "sent" })]);
  expect(await emailsOf(sam)).toEqual([
    expect.objectContaining({ state: "pending", attempts: 1, retryInSeconds: 60 }),
  ]);
  const samLines = logLines(log).filter((line) => line.deliveryId === samEmail.id);
  expect(samLines).toEqual([
    expect.objectContaining({ level: "error", event: "notification", errorName: "PostgresError" }),
  ]);
  expect(JSON.stringify(samLines)).not.toContain(sam.email);
});

it("§1.4: a full batch is followed at once by another pass", async () => {
  const recipients = await dueMentionsFor(11);
  const stop = new AbortController();

  const running = runWorker({ signal: stop.signal });
  try {
    await vi.waitFor(async () => expect(await statesOf(recipients)).toEqual(Array(11).fill("sent")), {
      timeout: 2_000,
      interval: 50,
    });
  } finally {
    stop.abort();
    await running;
  }
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

  await sendDueDeliveries();

  expect(await emailsOf(sam)).toEqual([expect.objectContaining({ state: "pending", attempts: 0 })]);
});

it("§1.4: on SIGTERM the worker finishes the deliveries it claimed and claims no more", async () => {
  const recipients = await dueMentionsFor(11);
  const stop = new AbortController();
  const send = notificationSenders.email;
  vi.spyOn(notificationSenders, "email").mockImplementationOnce(async (...args) => {
    stop.abort();
    return send(...args);
  });

  await runWorker({ signal: stop.signal });

  const states = await statesOf(recipients);
  expect(states.filter((state) => state === "sent")).toHaveLength(10);
  expect(states.filter((state) => state === "pending")).toHaveLength(1);
});

it("§1.4: an error outside any delivery is logged and the worker keeps running", async () => {
  const connectionRefused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
    code: "ECONNREFUSED",
  });
  const claim = vi.spyOn(db, "transaction").mockRejectedValueOnce(connectionRefused);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const stop = new AbortController();

  const outcome = runWorker({ signal: stop.signal }).then(
    () => "stopped",
    (error: Error) => error.message,
  );
  await vi.waitFor(() => expect(claim).toHaveBeenCalled());
  stop.abort();

  expect(await outcome).toBe("stopped");
  expect(logLines(log)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ level: "error", event: "notification", errorName: "Error" }),
    ]),
  );
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

it("OPS-005: every pass records the worker heartbeat with now()", async () => {
  await db
    .insert(workerHeartbeats)
    .values({ name: "worker", lastPassAt: sql`now() - interval '5 minutes'` })
    .onConflictDoUpdate({
      target: workerHeartbeats.name,
      set: { lastPassAt: sql`now() - interval '5 minutes'` },
    });

  await onePass();

  const [heartbeat] = await db
    .select({ ageSeconds: sql<number>`extract(epoch from now() - ${workerHeartbeats.lastPassAt})::float` })
    .from(workerHeartbeats)
    .where(eq(workerHeartbeats.name, "worker"));
  expect(heartbeat.ageSeconds).toBeLessThan(5);
});

it("§1.4: the metrics line holds the queue and delivery counts, and no recipient or text", async () => {
  await emptyQueue();
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
  await sendFailsFor(kimEmail.id);
  await db
    .update(notificationBatches)
    .set({ sendAfter: sql`now() - interval '3 minutes'` })
    .where(eq(notificationBatches.recipientId, mia.id));
  await leaseEndsIn(mia, "1 minute");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});

  await onePass();

  const lines = workerLines(log);
  expect(lines).toEqual([
    {
      time: expect.any(String),
      level: "info",
      event: "worker",
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

it("§1.4: the metrics line is written at most once a minute", async () => {
  await emptyQueue();
  await dueMentionsFor(25);
  const stop = new AbortController();
  const send = notificationSenders.email;
  let sends = 0;
  vi.spyOn(notificationSenders, "email").mockImplementation(async (...args) => {
    if (++sends === 25) stop.abort();
    return send(...args);
  });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});

  await runWorker({ signal: stop.signal });

  expect(sends).toBe(25);
  expect(workerLines(log)).toHaveLength(1);
});