import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createIssue, createMember, createProject } from "../test/factories";
import { deleteComment, editComment, postIssueComment } from "./comments";
import { db } from "./db";
import { outbox } from "./email/outbox";
import { updateIssue } from "./issues";
import { issues, members, notificationBatches, notificationDeliveries, notifications } from "./schema";
import type { Member } from "./sessions";
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

it("REQ-045: an email isn't sent before its 2 minutes are up", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);

  await sendAllDue();

  expect(mailTo(sam)).toEqual([]);
  expect((await emailsOf(sam)).map((email) => email.state)).toEqual(["pending"]);
});

it("REQ-045: a due email is sent and recorded", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
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

it("REQ-045.2: reassigned to Jo during the wait → Sam gets nothing; Jo gets one email", async () => {
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
  expect((await emailsOf(sam)).map((email) => email.state)).toEqual(["dropped"]);
  expect(mailTo(jo)).toHaveLength(1);
});

it("REQ-045.3: mention edited out during the wait → Sam gets nothing", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  const posted = await comment(issueRef, alex, `@${sam.username} look`);
  await editComment(alex, posted.id, { body: "look", version: 0 });
  await waitIsOver(sam);

  await sendAllDue();

  expect(mailTo(sam)).toEqual([]);
  expect((await emailsOf(sam)).map((email) => email.state)).toEqual(["dropped"]);
});

it("REQ-045.4: comment deleted during the wait → Sam gets nothing", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  const posted = await comment(issueRef, alex, `@${sam.username} look`);
  await deleteComment(alex, posted.id);
  await waitIsOver(sam);

  await sendAllDue();

  expect(mailTo(sam)).toEqual([]);
  expect((await emailsOf(sam)).map((email) => email.state)).toEqual(["dropped"]);
});

it("REQ-045.5: Sam deactivated during the wait → no email", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
  await db.update(members).set({ deactivatedAt: sql`now()` }).where(eq(members.id, sam.id));
  await waitIsOver(sam);

  await sendAllDue();

  expect(mailTo(sam)).toEqual([]);
  expect((await emailsOf(sam)).map((email) => email.state)).toEqual(["dropped"]);
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

it("STD-6: a failed send is retried after 1, then 4, then 10 minutes", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
  await waitIsOver(sam);
  outbox.failing = true;
  vi.spyOn(console, "log").mockImplementation(() => {});

  await sendAllDue();
  expect(await emailsOf(sam)).toEqual([
    expect.objectContaining({ state: "pending", attempts: 1, retryInSeconds: 60 }),
  ]);

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
  expect(mailTo(sam)).toEqual([]);
});

it("STD-6: after the third retry fails the email is failed and logged; nothing more is sent", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
  await waitIsOver(sam);
  outbox.failing = true;
  const log = vi.spyOn(console, "log").mockImplementation(() => {});

  await sendAllDue();
  for (let retry = 0; retry < 3; retry++) {
    await retryIsDue(sam);
    await sendAllDue();
  }

  const [email] = await emailsOf(sam);
  expect(email).toEqual(expect.objectContaining({ state: "failed", attempts: 4 }));
  const failures = log.mock.calls
    .map(([line]) => JSON.parse(String(line)))
    .filter((line) => line.event === "notification" && line.deliveryId === email.id);
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

it("§1.4: on SIGTERM the worker finishes its current pass and exits", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  await assign(issueRef, alex, sam);
  await waitIsOver(sam);
  const stop = new AbortController();

  const running = runWorker({ signal: stop.signal });
  stop.abort();
  await running;

  expect(mailTo(sam)).toHaveLength(1);
  expect((await emailsOf(sam)).map((email) => email.state)).toEqual(["sent"]);
});