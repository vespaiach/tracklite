import "server-only";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { assignmentKey, Delivery, mentionKey } from "../../domain/notifications/delivery";
import type { DeliveryRepository } from "../../domain/notifications/delivery-repository";
import { dueAt } from "../../queries";
import { deleteInChunks } from "../chunked-delete";
import { db } from "../db";
import { members } from "../identity/tables";
import { issueAssignees, issues } from "../issues/tables";
import { projects } from "../projects/tables";
import type { Transaction } from "../transaction";
import { mentions, notificationBatches, notificationDeliveries, notifications } from "./tables";

type Sources = { issueIds: string[]; projectIds: string[]; commentIds: string[] };

export const drizzleDeliveryRepository: DeliveryRepository = {
  claimDue,
  dropChecks,
  drop,

  async recordSent(delivery, providerMessageId) {
    const recorded = await db
      .update(notificationDeliveries)
      .set({ state: "sent", providerMessageId, sentAt: sql`now()`, stateChangedAt: sql`now()` })
      .where(heldBy(delivery))
      .returning({ id: notificationDeliveries.id });
    return recorded.length > 0;
  },

  async recordRetry(delivery, retryInMinutes) {
    await db
      .update(notificationDeliveries)
      .set({
        attempts: delivery.props.attempts + 1,
        nextAttemptAt: sql`now() + make_interval(mins => ${retryInMinutes})`,
        lockedUntil: null,
      })
      .where(heldBy(delivery));
  },

  async recordFailed(delivery) {
    const failed = await db
      .update(notificationDeliveries)
      .set({ state: "failed", attempts: delivery.props.attempts + 1, stateChangedAt: sql`now()` })
      .where(heldBy(delivery))
      .returning({ id: notificationDeliveries.id });
    return failed.length > 0;
  },

  async markBounced(providerMessageId) {
    const [delivery] = await db
      .update(notificationDeliveries)
      .set({ state: "bounced", stateChangedAt: sql`now()` })
      .where(
        and(
          eq(notificationDeliveries.channel, "email"),
          eq(notificationDeliveries.providerMessageId, providerMessageId),
        ),
      )
      .returning({ id: notificationDeliveries.id });
    return delivery?.id;
  },

  deleteFinishedBatches: () =>
    deleteInChunks(
      notificationBatches,
      sql`not exists (
        select from notification_deliveries delivery
        where delivery.batch_id = notification_batches.id
          and (delivery.state = 'pending'
            or coalesce(delivery.sent_at, delivery.next_attempt_at, notification_batches.send_after)
              >= now() - interval '30 days'))`,
    ),
};

function claimDue(limit: number) {
  return db.transaction(async (tx) => {
    const due = await dueDeliveries(tx, limit);
    if (due.length === 0) return [];

    const lease = await leaseDeliveries(
      tx,
      due.map((delivery) => delivery.id),
    );
    return due.map((delivery) => Delivery.rehydrate({ ...delivery, lease }));
  });
}

function dueDeliveries(tx: Transaction, limit: number) {
  return tx
    .select({
      id: notificationDeliveries.id,
      channel: notificationDeliveries.channel,
      attempts: notificationDeliveries.attempts,
      batchId: notificationBatches.id,
      recipientId: notificationBatches.recipientId,
      targetType: notificationBatches.targetType,
      targetId: notificationBatches.targetId,
    })
    .from(notificationDeliveries)
    .innerJoin(notificationBatches, eq(notificationBatches.id, notificationDeliveries.batchId))
    .where(
      and(
        eq(notificationDeliveries.state, "pending"),
        lte(dueAt, sql`now()`),
        or(isNull(notificationDeliveries.lockedUntil), lte(notificationDeliveries.lockedUntil, sql`now()`)),
      ),
    )
    .orderBy(asc(notificationBatches.sendAfter))
    .limit(limit)
    .for("update", { of: notificationDeliveries, skipLocked: true });
}

async function leaseDeliveries(tx: Transaction, ids: string[]) {
  const [{ lease }] = await tx
    .update(notificationDeliveries)
    .set({ lockedUntil: sql`now() + interval '2 minutes'` })
    .where(inArray(notificationDeliveries.id, ids))
    .returning({ lease: sql<string>`${notificationDeliveries.lockedUntil}::text` });
  return lease;
}

function heldBy(delivery: Delivery) {
  return and(
    eq(notificationDeliveries.id, delivery.props.id),
    eq(notificationDeliveries.state, "pending"),
    eq(notificationDeliveries.lockedUntil, sql`${delivery.props.lease}::timestamptz`),
  );
}

async function dropChecks(claimed: Delivery[]) {
  const recipientIds = unique(claimed.map((delivery) => delivery.props.recipientId));
  const issueIds = targetIdsOf(claimed, "issue");
  const projectIds = targetIdsOf(claimed, "project");

  const recipients = await db.select().from(members).where(inArray(members.id, recipientIds));
  const items = await itemsOf(unique(claimed.map((delivery) => delivery.props.batchId)));
  const existingIssues = await db.select({ id: issues.id }).from(issues).where(inArray(issues.id, issueIds));
  const assignments = await db
    .select({ issueId: issueAssignees.issueId, memberId: issueAssignees.memberId })
    .from(issueAssignees)
    .where(and(inArray(issueAssignees.issueId, issueIds), inArray(issueAssignees.memberId, recipientIds)));
  const existingProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(inArray(projects.id, projectIds));
  const commentIds = unique(items.flatMap((item) => (item.commentId ? [item.commentId] : [])));
  const mentioned = await mentionsOf(recipientIds, { issueIds, projectIds, commentIds });

  return {
    recipients: new Map(recipients.map((recipient) => [recipient.id, recipient])),
    items,
    existingIssueIds: new Set(existingIssues.map((issue) => issue.id)),
    assignmentKeys: new Set(
      assignments.map((assignment) => assignmentKey(assignment.memberId, assignment.issueId)),
    ),
    existingProjectIds: new Set(existingProjects.map((project) => project.id)),
    mentionKeys: new Set(
      mentioned.map((mention) =>
        mentionKey(mention.memberId, mention.commentId ?? mention.issueId ?? mention.projectId),
      ),
    ),
  };
}

function unique(ids: string[]) {
  return [...new Set(ids)];
}

function targetIdsOf(claimed: Delivery[], targetType: string) {
  return unique(
    claimed
      .filter((delivery) => delivery.props.targetType === targetType)
      .map((delivery) => delivery.props.targetId),
  );
}

function itemsOf(batchIds: string[]) {
  return db
    .select({
      id: notifications.id,
      batchId: notifications.batchId,
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
    .where(and(inArray(notifications.batchId, batchIds), eq(notifications.dropped, false)))
    .orderBy(asc(notifications.createdAt), asc(notifications.id));
}

function mentionsOf(recipientIds: string[], sources: Sources) {
  return db
    .select({
      memberId: mentions.memberId,
      issueId: mentions.issueId,
      projectId: mentions.projectId,
      commentId: mentions.commentId,
    })
    .from(mentions)
    .where(
      and(
        inArray(mentions.memberId, recipientIds),
        or(
          inArray(mentions.issueId, sources.issueIds),
          inArray(mentions.projectId, sources.projectIds),
          inArray(mentions.commentId, sources.commentIds),
        ),
      ),
    );
}

function drop(delivery: Delivery, notificationIds: string[], wholeDelivery: boolean) {
  return db.transaction(async (tx) => {
    if (!(await holdsLease(tx, delivery))) return false;

    await dropNotifications(tx, notificationIds);

    if (wholeDelivery) {
      await tx
        .update(notificationDeliveries)
        .set({ state: "dropped", stateChangedAt: sql`now()` })
        .where(heldBy(delivery));
    }
    return true;
  });
}

async function holdsLease(tx: Transaction, delivery: Delivery) {
  const held = await tx
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(heldBy(delivery))
    .for("update");
  return held.length > 0;
}

async function dropNotifications(tx: Transaction, ids: string[]) {
  if (ids.length === 0) return;
  await tx.update(notifications).set({ dropped: true }).where(inArray(notifications.id, ids));
}