import { randomBytes, randomUUID } from "node:crypto";
import { eq, inArray, type SQL, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { createMember, createNotificationBatch } from "../../test/factories";
import { deleteExpiredRows } from "./cleanup";
import { db } from "./db";
import {
  invitations,
  notificationBatches,
  notificationDeliveries,
  notifications,
  passwordResetRequests,
  passwordResetTokens,
  sessions,
  signInAttempts,
} from "./schema";
import { createToken, hashToken } from "./tokens";

type DeliveryState = (typeof notificationDeliveries.$inferSelect)["state"];

function ago(interval: string) {
  return sql`now() - ${interval}::interval`;
}

function uniqueEmail() {
  return `cleanup-${randomBytes(5).toString("hex")}@example.test`;
}

async function invitation(
  dates: Partial<Record<"acceptedAt" | "revokedAt" | "expiresAt" | "createdAt", SQL>>,
) {
  const admin = await createMember({ role: "admin" });
  const [row] = await db
    .insert(invitations)
    .values({
      email: uniqueEmail(),
      invitedBy: admin.id,
      tokenHash: hashToken(createToken()),
      expiresAt: sql`now() + interval '7 days'`,
      ...dates,
    })
    .returning({ id: invitations.id });
  return row.id;
}

async function remainingInvitations(ids: string[]) {
  const rows = await db.select({ id: invitations.id }).from(invitations).where(inArray(invitations.id, ids));
  return rows.map((row) => row.id);
}

async function resetLink(dates: Partial<Record<"usedAt" | "expiresAt", SQL>>) {
  const member = await createMember();
  const [row] = await db
    .insert(passwordResetTokens)
    .values({
      memberId: member.id,
      tokenHash: hashToken(createToken()),
      expiresAt: sql`now() + interval '30 minutes'`,
      ...dates,
    })
    .returning({ id: passwordResetTokens.id });
  return row.id;
}

async function resetLinkExists(id: string) {
  const rows = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.id, id));
  return rows.length === 1;
}

async function session(lastActive: string) {
  const member = await createMember();
  const [row] = await db
    .insert(sessions)
    .values({ memberId: member.id, tokenHash: hashToken(createToken()), lastActiveAt: ago(lastActive) })
    .returning({ id: sessions.id });
  return row.id;
}

async function sessionExists(id: string) {
  const rows = await db.select().from(sessions).where(eq(sessions.id, id));
  return rows.length === 1;
}

async function notificationEmail(
  state: DeliveryState,
  { sendAfter, ...deliveryDates }: { sendAfter: SQL; sentAt?: SQL; nextAttemptAt?: SQL },
) {
  const member = await createMember();
  const { batch } = await createNotificationBatch(
    { recipientId: member.id, targetType: "issue", targetId: randomUUID(), sendAfter },
    { state, ...deliveryDates },
  );
  await db.insert(notifications).values({
    batchId: batch.id,
    kind: "assigned",
    actorId: member.id,
    issueRef: "WEB-1",
    issueTitle: "Fix login button",
    projectName: "Website",
    projectKey: "WEB",
    linkPath: "/issues/WEB-1",
    excerpt: "",
  });
  return batch.id;
}

async function notificationEmailExists(batchId: string) {
  const batches = await db.select().from(notificationBatches).where(eq(notificationBatches.id, batchId));
  const deliveries = await db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.batchId, batchId));
  const items = await db.select().from(notifications).where(eq(notifications.batchId, batchId));
  return batches.length === 1 && deliveries.length === 1 && items.length === 1;
}

async function rowsPerDeleteFrom(table: string, run: () => Promise<unknown>) {
  await db.execute(sql`create table deleted_per_statement (id serial, rows int)`);
  await db.execute(
    sql.raw(`create function record_deleted_rows() returns trigger language plpgsql as $$
      begin
        insert into deleted_per_statement (rows) select count(*) from old_rows;
        return null;
      end $$`),
  );
  await db.execute(
    sql.raw(`create trigger record_deleted_rows after delete on ${table}
      referencing old table as old_rows for each statement execute function record_deleted_rows()`),
  );
  try {
    await run();
    const counts = await db.execute<{ rows: number }>(
      sql`select rows from deleted_per_statement where rows > 0 order by id`,
    );
    return counts.map((count) => count.rows);
  } finally {
    await db.execute(sql.raw(`drop trigger if exists record_deleted_rows on ${table}`));
    await db.execute(sql`drop function if exists record_deleted_rows()`);
    await db.execute(sql`drop table if exists deleted_per_statement`);
  }
}

it("DATA-004: invitations are deleted 30 days after being accepted, revoked or expiring", async () => {
  const accepted = await invitation({ acceptedAt: ago("31 days") });
  const revoked = await invitation({ revokedAt: ago("31 days") });
  const expired = await invitation({ expiresAt: ago("31 days") });
  const recentlyAccepted = await invitation({ acceptedAt: ago("29 days") });
  const recentlyExpired = await invitation({ expiresAt: ago("29 days") });
  const pending = await invitation({ createdAt: ago("40 days") });

  await deleteExpiredRows();

  const remaining = await remainingInvitations([
    accepted,
    revoked,
    expired,
    recentlyAccepted,
    recentlyExpired,
    pending,
  ]);
  expect(remaining.sort()).toEqual([recentlyAccepted, recentlyExpired, pending].sort());
});

it("DATA-004.1, DATA-004: password reset links are deleted 30 days after expiring or being used", async () => {
  const expiredLongAgo = await resetLink({ expiresAt: ago("31 days") });
  const usedLongAgo = await resetLink({ usedAt: ago("31 days") });
  const usedRecently = await resetLink({ usedAt: ago("29 days"), expiresAt: ago("29 days") });

  await deleteExpiredRows();

  expect(await resetLinkExists(expiredLongAgo)).toBe(false);
  expect(await resetLinkExists(usedLongAgo)).toBe(false);
  expect(await resetLinkExists(usedRecently)).toBe(true);
});

it("DATA-004: sessions are deleted 30 days after they end through inactivity", async () => {
  const endedLongAgo = await session("61 days");
  const endedRecently = await session("59 days");

  await deleteExpiredRows();

  expect(await sessionExists(endedLongAgo)).toBe(false);
  expect(await sessionExists(endedRecently)).toBe(true);
});

it("DATA-004.2, DATA-004: finished notifications are deleted 30 days after they finish; one sent 10 days ago and pending ones stay", async () => {
  const sent = await notificationEmail("sent", { sendAfter: ago("31 days"), sentAt: ago("31 days") });
  const dropped = await notificationEmail("dropped", { sendAfter: ago("31 days") });
  const failed = await notificationEmail("failed", {
    sendAfter: ago("40 days"),
    nextAttemptAt: ago("31 days"),
  });
  const bounced = await notificationEmail("bounced", { sendAfter: ago("31 days"), sentAt: ago("31 days") });
  const recentlyFailed = await notificationEmail("failed", {
    sendAfter: ago("40 days"),
    nextAttemptAt: ago("29 days"),
  });
  const pending = await notificationEmail("pending", { sendAfter: ago("40 days") });
  const sentRecently = await notificationEmail("sent", { sendAfter: ago("10 days"), sentAt: ago("10 days") });

  await deleteExpiredRows();

  for (const id of [sent, dropped, failed, bounced]) expect(await notificationEmailExists(id)).toBe(false);
  expect(await notificationEmailExists(recentlyFailed)).toBe(true);
  expect(await notificationEmailExists(pending)).toBe(true);
  expect(await notificationEmailExists(sentRecently)).toBe(true);
});

it("DATA-004: sign-in attempts are deleted 30 days after they're an hour old, and password reset requests 30 days after they're a day old", async () => {
  const old = uniqueEmail();
  const recent = uniqueEmail();
  await db.insert(signInAttempts).values([
    { email: old, ip: "127.0.0.1", createdAt: ago("30 days 2 hours") },
    { email: recent, ip: "127.0.0.1", createdAt: ago("30 days 30 minutes") },
  ]);
  await db.insert(passwordResetRequests).values([
    { email: old, ip: "127.0.0.1", createdAt: ago("31 days 1 hour") },
    { email: recent, ip: "127.0.0.1", createdAt: ago("30 days 23 hours") },
  ]);

  await deleteExpiredRows();

  const attempts = await db
    .select({ email: signInAttempts.email })
    .from(signInAttempts)
    .where(inArray(signInAttempts.email, [old, recent]));
  const requests = await db
    .select({ email: passwordResetRequests.email })
    .from(passwordResetRequests)
    .where(inArray(passwordResetRequests.email, [old, recent]));
  expect(attempts.map((row) => row.email)).toEqual([recent]);
  expect(requests.map((row) => row.email)).toEqual([recent]);
});

it("DATA-004: cleanup deletes more than one chunk's worth of rows, at most 1,000 per statement", async () => {
  await deleteExpiredRows();
  const email = uniqueEmail();
  await db.execute(sql`
    insert into sign_in_attempts (email, ip, created_at)
    select ${email}, '127.0.0.1', now() - interval '31 days' from generate_series(1, 2500)`);

  const rowsPerStatement = await rowsPerDeleteFrom("sign_in_attempts", deleteExpiredRows);

  const remaining = await db.select().from(signInAttempts).where(eq(signInAttempts.email, email));
  expect(remaining).toEqual([]);
  expect(rowsPerStatement).toEqual([1000, 1000, 500]);
});