import { randomBytes, randomUUID } from "node:crypto";
import { eq, inArray, type SQL, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { createMember } from "../test/factories";
import { deleteExpiredRows } from "./cleanup";
import { db } from "./db";
import {
  invitations,
  notificationEmails,
  notifications,
  passwordResetRequests,
  passwordResetTokens,
  sessions,
  signInAttempts,
} from "./schema";
import { createToken, hashToken } from "./tokens";

type EmailState = (typeof notificationEmails.$inferSelect)["state"];

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
  state: EmailState,
  dates: { sendAfter: SQL; sentAt?: SQL; nextAttemptAt?: SQL },
) {
  const member = await createMember();
  const [email] = await db
    .insert(notificationEmails)
    .values({ recipientId: member.id, targetType: "issue", targetId: randomUUID(), state, ...dates })
    .returning({ id: notificationEmails.id });
  await db.insert(notifications).values({
    emailId: email.id,
    kind: "assigned",
    actorId: member.id,
    issueRef: "WEB-1",
    issueTitle: "Fix login button",
    projectName: "Website",
    projectKey: "WEB",
    linkPath: "/issues/WEB-1",
    excerpt: "",
  });
  return email.id;
}

async function notificationEmailExists(id: string) {
  const emails = await db.select().from(notificationEmails).where(eq(notificationEmails.id, id));
  const items = await db.select().from(notifications).where(eq(notifications.emailId, id));
  return emails.length === 1 && items.length === 1;
}

it("DATA-004.1: a password reset link expired 31 days ago is no longer in the database", async () => {
  const id = await resetLink({ expiresAt: ago("31 days") });

  await deleteExpiredRows();

  expect(await resetLinkExists(id)).toBe(false);
});

it("DATA-004.2: a notification sent 10 days ago is still stored", async () => {
  const id = await notificationEmail("sent", { sendAfter: ago("10 days"), sentAt: ago("10 days") });

  await deleteExpiredRows();

  expect(await notificationEmailExists(id)).toBe(true);
});

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

it("DATA-004: password reset links are deleted 30 days after being used", async () => {
  const usedLongAgo = await resetLink({ usedAt: ago("31 days") });
  const usedRecently = await resetLink({ usedAt: ago("29 days"), expiresAt: ago("29 days") });

  await deleteExpiredRows();

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

it("DATA-004: finished notifications are deleted 30 days after they finish, pending ones never", async () => {
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

  await deleteExpiredRows();

  for (const id of [sent, dropped, failed, bounced]) expect(await notificationEmailExists(id)).toBe(false);
  expect(await notificationEmailExists(recentlyFailed)).toBe(true);
  expect(await notificationEmailExists(pending)).toBe(true);
});

it("DATA-004: sign-in attempts are deleted 30 days after they're an hour old", async () => {
  const old = uniqueEmail();
  const recent = uniqueEmail();
  await db.insert(signInAttempts).values([
    { email: old, ip: "127.0.0.1", createdAt: ago("30 days 2 hours") },
    { email: recent, ip: "127.0.0.1", createdAt: ago("30 days 30 minutes") },
  ]);

  await deleteExpiredRows();

  const rows = await db
    .select({ email: signInAttempts.email })
    .from(signInAttempts)
    .where(inArray(signInAttempts.email, [old, recent]));
  expect(rows.map((row) => row.email)).toEqual([recent]);
});

it("DATA-004: password reset requests are deleted 30 days after they're a day old", async () => {
  const old = uniqueEmail();
  const recent = uniqueEmail();
  await db.insert(passwordResetRequests).values([
    { email: old, ip: "127.0.0.1", createdAt: ago("31 days 1 hour") },
    { email: recent, ip: "127.0.0.1", createdAt: ago("30 days 23 hours") },
  ]);

  await deleteExpiredRows();

  const rows = await db
    .select({ email: passwordResetRequests.email })
    .from(passwordResetRequests)
    .where(inArray(passwordResetRequests.email, [old, recent]));
  expect(rows.map((row) => row.email)).toEqual([recent]);
});