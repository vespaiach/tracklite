import "server-only";
import { and, eq, gt, inArray, isNull, notInArray, type SQL, sql } from "drizzle-orm";
import type {
  MentionSource,
  Notice,
  NotificationRepository,
  OutboxEvent,
  OutboxWriter,
  Snapshot,
} from "../../domain/notifications/notification-repository";
import type { EventTarget } from "../../domain/shared/events";
import { findMentions, toPlainText } from "../../lib/markdown/parse";
import { members } from "../identity/tables";
import { issues } from "../issues/tables";
import { projects } from "../projects/tables";
import type { Transaction } from "../transaction";
import { mentions, notificationBatches, notificationDeliveries, notifications, outboxEvents } from "./tables";

const maxExcerptLength = 500;

export function drizzleOutboxWriter(tx: Transaction): OutboxWriter {
  return {
    replaceMentions: (source, text) => replaceMentions(tx, source, text),

    async add(type, recipientIds, notice) {
      await tx.insert(outboxEvents).values({
        type,
        payload: {
          kind: notice.kind,
          actorId: notice.actorId,
          commentId: notice.commentId ?? null,
          recipientIds,
          snapshot: await snapshotOf(tx, notice),
        },
      });
    },
  };
}

export function drizzleNotificationRepository(tx: Transaction): NotificationRepository {
  return {
    async record(event, recipientId) {
      if (await alreadyRecorded(tx, event, recipientId)) return;

      const { targetType, targetId, ...snapshot } = event.payload.snapshot;
      await tx.insert(notifications).values({
        batchId: await batchFor(tx, event, recipientId, targetType, targetId),
        eventId: event.id,
        recipientId,
        kind: event.payload.kind,
        actorId: event.payload.actorId,
        commentId: event.payload.commentId,
        ...snapshot,
      });
    },
  };
}

async function alreadyRecorded(tx: Transaction, event: OutboxEvent, recipientId: string) {
  const found = await tx.$count(
    notifications,
    and(eq(notifications.eventId, event.id), eq(notifications.recipientId, recipientId)),
  );
  return found > 0;
}

async function replaceMentions(tx: Transaction, source: MentionSource, text: string) {
  const memberIds = await activeMemberIds(tx, findMentions(text));

  await tx
    .delete(mentions)
    .where(
      and(mentionsFrom(source), memberIds.length > 0 ? notInArray(mentions.memberId, memberIds) : undefined),
    );

  if (memberIds.length === 0) return [];

  const added = await tx
    .insert(mentions)
    .values(memberIds.map((memberId) => ({ memberId, ...source })))
    .onConflictDoNothing()
    .returning({ memberId: mentions.memberId });
  return added.map((row) => row.memberId);
}

async function activeMemberIds(tx: Transaction, usernames: string[]) {
  if (usernames.length === 0) return [];
  const found = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(inArray(members.username, usernames), isNull(members.deactivatedAt)));
  return found.map((row) => row.id);
}

function mentionsFrom(source: MentionSource) {
  if ("projectId" in source) return eq(mentions.projectId, source.projectId);
  if ("issueId" in source) return eq(mentions.issueId, source.issueId);
  return eq(mentions.commentId, source.commentId);
}

function excerptOf({ text }: Notice) {
  if (text === undefined) return "";
  const characters = [...toPlainText(text).replace(/\s+/g, " ").trim()];
  if (characters.length <= maxExcerptLength) return characters.join("");
  return `${characters.slice(0, maxExcerptLength).join("")}…`;
}

async function snapshotOf(tx: Transaction, notice: Notice): Promise<Snapshot> {
  const { linkPath, ...target } = await targetSnapshot(tx, notice.target);
  return {
    ...target,
    linkPath: notice.commentId ? `${linkPath}#comment-${notice.commentId}` : linkPath,
    excerpt: excerptOf(notice),
  };
}

function targetSnapshot(tx: Transaction, target: EventTarget) {
  return "issueId" in target ? issueSnapshot(tx, target.issueId) : projectSnapshot(tx, target.projectId);
}

async function issueSnapshot(tx: Transaction, issueId: string) {
  const [issue] = await tx
    .select({
      number: issues.number,
      title: issues.title,
      projectName: projects.name,
      projectKey: projects.key,
    })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .where(eq(issues.id, issueId));
  const issueRef = `${issue.projectKey}-${issue.number}`;
  return {
    targetType: "issue" as const,
    targetId: issueId,
    issueRef,
    issueTitle: issue.title,
    projectName: issue.projectName,
    projectKey: issue.projectKey,
    linkPath: `/issue/${issueRef}`,
  };
}

async function projectSnapshot(tx: Transaction, projectId: string) {
  const [project] = await tx
    .select({ name: projects.name, key: projects.key })
    .from(projects)
    .where(eq(projects.id, projectId));
  return {
    targetType: "project" as const,
    targetId: projectId,
    issueRef: null,
    issueTitle: null,
    projectName: project.name,
    projectKey: project.key,
    linkPath: `/project/${project.key}/detail`,
  };
}

async function batchFor(
  tx: Transaction,
  event: OutboxEvent,
  recipientId: string,
  targetType: string,
  targetId: string,
) {
  const occurredAt = occurredAtOf(event);
  const [waiting] = await tx
    .select({ id: notificationBatches.id })
    .from(notificationBatches)
    .where(
      and(
        eq(notificationBatches.recipientId, recipientId),
        eq(notificationBatches.targetType, targetType),
        eq(notificationBatches.targetId, targetId),
        gt(notificationBatches.sendAfter, occurredAt),
        gt(notificationBatches.sendAfter, sql`now()`),
      ),
    )
    .limit(1);
  if (waiting) return waiting.id;

  return createBatch(tx, recipientId, targetType, targetId, sql`${occurredAt} + interval '2 minutes'`);
}

function occurredAtOf(event: OutboxEvent) {
  return sql`(select ${outboxEvents.occurredAt} from ${outboxEvents} where ${outboxEvents.id} = ${event.id})`;
}

async function createBatch(
  tx: Transaction,
  recipientId: string,
  targetType: string,
  targetId: string,
  sendAfter: SQL,
) {
  const [batch] = await tx
    .insert(notificationBatches)
    .values({ recipientId, targetType, targetId, sendAfter })
    .returning({ id: notificationBatches.id });

  const [recipient] = await tx
    .select({ channels: members.notificationChannels })
    .from(members)
    .where(eq(members.id, recipientId));

  await tx
    .insert(notificationDeliveries)
    .values(recipient.channels.map((channel) => ({ batchId: batch.id, channel, state: "pending" as const })));

  return batch.id;
}