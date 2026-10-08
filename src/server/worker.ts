import "server-only";
import { setTimeout as sleep } from "node:timers/promises";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { deleteExpiredRows } from "./cleanup";
import { db } from "./db";
import { sendEmail } from "./email/send";
import { notificationEmail } from "./email/templates";
import { logNotificationFailure } from "./log";
import { issues, members, mentions, notificationEmails, notifications, projects } from "./schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DueEmail = typeof notificationEmails.$inferSelect;
type Item = Awaited<ReturnType<typeof itemsOf>>[number];

const batchSize = 10;
const pollIntervalMs = 5_000;
const retryDelaysMinutes = [1, 4, 10];
const cleanupIntervalMs = 60 * 60_000;

export async function runWorker({ signal }: { signal: AbortSignal }) {
  let nextCleanupAt = 0;
  do {
    await sendDueEmails();
    if (performance.now() >= nextCleanupAt) {
      await deleteExpiredRows();
      nextCleanupAt = performance.now() + cleanupIntervalMs;
    }
    await sleep(pollIntervalMs, undefined, { signal }).catch(() => {});
  } while (!signal.aborted);
}

export function sendDueEmails() {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(notificationEmails)
      .where(
        and(
          eq(notificationEmails.state, "pending"),
          lte(
            sql`coalesce(${notificationEmails.nextAttemptAt}, ${notificationEmails.sendAfter})`,
            sql`now()`,
          ),
        ),
      )
      .orderBy(asc(notificationEmails.sendAfter))
      .limit(batchSize)
      .for("update", { skipLocked: true });
    for (const email of due) await deliver(tx, email);
    return due.length;
  });
}

function itemsOf(tx: Transaction, emailId: string) {
  return tx
    .select({
      id: notifications.id,
      kind: notifications.kind,
      commentId: notifications.commentId,
      actorName: members.fullName,
      issueRef: notifications.issueRef,
      issueTitle: notifications.issueTitle,
      projectName: notifications.projectName,
      projectKey: notifications.projectKey,
      linkPath: notifications.linkPath,
      excerpt: notifications.excerpt,
    })
    .from(notifications)
    .innerJoin(members, eq(members.id, notifications.actorId))
    .where(eq(notifications.emailId, emailId))
    .orderBy(asc(notifications.createdAt), asc(notifications.id));
}

async function deliver(tx: Transaction, email: DueEmail) {
  const [recipient] = await tx.select().from(members).where(eq(members.id, email.recipientId));
  const items = await itemsOf(tx, email.id);
  const kept: Item[] = [];
  for (const item of items) {
    if (recipient.deactivatedAt === null && (await stillWanted(tx, email, item))) kept.push(item);
  }
  const dropped = items.filter((item) => !kept.includes(item)).map((item) => item.id);
  if (dropped.length > 0) {
    await tx.update(notifications).set({ dropped: true }).where(inArray(notifications.id, dropped));
  }
  if (kept.length === 0) {
    await tx.update(notificationEmails).set({ state: "dropped" }).where(eq(notificationEmails.id, email.id));
    return;
  }

  try {
    const { providerMessageId } = await sendEmail({
      to: recipient.email,
      ...notificationEmail(kept),
      idempotencyKey: email.id,
    });
    await tx
      .update(notificationEmails)
      .set({ state: "sent", providerMessageId, sentAt: sql`now()` })
      .where(eq(notificationEmails.id, email.id));
  } catch {
    await recordFailure(tx, email);
  }
}

async function stillWanted(tx: Transaction, email: DueEmail, item: Item) {
  if (email.targetType === "project") {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, email.targetId));
    if (!project) return true;
  } else {
    const [issue] = await tx
      .select({ assigneeId: issues.assigneeId })
      .from(issues)
      .where(eq(issues.id, email.targetId));
    if (!issue) return true;
    if (item.kind === "assigned") return issue.assigneeId === email.recipientId;
  }
  const source = item.commentId
    ? eq(mentions.commentId, item.commentId)
    : email.targetType === "issue"
      ? eq(mentions.issueId, email.targetId)
      : eq(mentions.projectId, email.targetId);
  const [mention] = await tx
    .select({ id: mentions.id })
    .from(mentions)
    .where(and(eq(mentions.memberId, email.recipientId), source));
  return mention !== undefined;
}

async function recordFailure(tx: Transaction, email: DueEmail) {
  const delayMinutes = retryDelaysMinutes[email.attempts];
  if (delayMinutes === undefined) {
    await tx
      .update(notificationEmails)
      .set({ state: "failed", attempts: email.attempts + 1 })
      .where(eq(notificationEmails.id, email.id));
    logNotificationFailure({ emailId: email.id });
    return;
  }
  await tx
    .update(notificationEmails)
    .set({
      attempts: email.attempts + 1,
      nextAttemptAt: sql`now() + make_interval(mins => ${delayMinutes})`,
    })
    .where(eq(notificationEmails.id, email.id));
}