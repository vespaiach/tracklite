import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { vi } from "vitest";
import { postIssueComment } from "../application/comments/post-comment";
import { updateIssue } from "../application/issues/update-issue";
import { IssueId, Username } from "../domain/shared/identifiers";
import { commentWork } from "../infrastructure/comments/comment-work";
import { db } from "../infrastructure/db";
import { outbox } from "../infrastructure/email/outbox";
import type { Member } from "../infrastructure/identity/tables";
import { issueWork } from "../infrastructure/issues/issue-work";
import { issues } from "../infrastructure/issues/tables";
import { notificationSenders } from "../infrastructure/notifications/channels";
import { notificationBatches, notificationDeliveries } from "../infrastructure/notifications/tables";
import { createIssue, createMember, createProject, newRequestId } from "./factories";
import { recordEvents } from "./outbox";

export async function website() {
  const project = await createProject({ name: "Website" });
  const issue = await createIssue(project.id);
  await db.update(issues).set({ title: "Fix login button" }).where(eq(issues.id, issue.id));
  return { project, issue, issueRef: `${project.key}-${issue.number}` };
}

export async function assign(issueRef: string, by: Member, ...assignees: Member[]) {
  await updateIssue(by, issueWork, IssueId.from(issueRef), {
    assignees: assignees.map((assignee) => Username.from(assignee.username)),
  });
  await recordEvents();
}

export async function comment(issueRef: string, by: Member, body: string) {
  const { commentId } = await postIssueComment(by, commentWork, IssueId.from(issueRef), {
    requestId: newRequestId(),
    body,
  });
  await recordEvents();
  return { id: commentId };
}

export function batchesOf(member: { id: string }) {
  return db
    .select({ id: notificationBatches.id })
    .from(notificationBatches)
    .where(eq(notificationBatches.recipientId, member.id));
}

export function emailsOf(member: { id: string }) {
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

export async function waitIsOver(member: { id: string }) {
  await db
    .update(notificationBatches)
    .set({ sendAfter: sql`now() - interval '1 second'` })
    .where(eq(notificationBatches.recipientId, member.id));
}

export function mailTo(member: { email: string }) {
  return outbox.sent.filter((email) => email.to === member.email);
}

export async function leaseEndsIn(member: { id: string }, interval: string) {
  await db.execute(
    sql`update ${notificationDeliveries} set locked_until = now() + ${interval}::interval where ${inArray(notificationDeliveries.batchId, batchesOf(member))}`,
  );
}

export async function dueMentionsFor(count: number) {
  const alex = await createMember();
  const recipients = await Promise.all(Array.from({ length: count }, () => createMember()));
  const { issueRef } = await website();

  await comment(issueRef, alex, recipients.map((recipient) => `@${recipient.username}`).join(" "));
  for (const recipient of recipients) await waitIsOver(recipient);

  return recipients;
}

export async function statesOf(recipients: { id: string }[]) {
  const emails = await Promise.all(recipients.map(emailsOf));
  return emails.flat().map((email) => email.state);
}

export function sendFailsFor(deliveryId: string) {
  const send = notificationSenders.email;
  vi.spyOn(notificationSenders, "email").mockImplementation(async (...args) => {
    if (args[2] === deliveryId) throw new Error("provider down");
    return send(...args);
  });
}

export async function emptyQueue() {
  await db.delete(notificationDeliveries).where(eq(notificationDeliveries.state, "pending"));
}