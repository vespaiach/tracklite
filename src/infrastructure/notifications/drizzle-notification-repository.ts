import "server-only";
import { and, eq, gt, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type {
  MentionSource,
  Notice,
  NotificationRepository,
} from "../../domain/notifications/notification-repository";
import type { EventTarget } from "../../domain/shared/events";
import { findMentions, toPlainText } from "../../lib/markdown/parse";
import { members } from "../identity/tables";
import { issues } from "../issues/tables";
import { projects } from "../projects/tables";
import type { Transaction } from "../transaction";
import { mentions, notificationBatches, notificationDeliveries, notifications } from "./tables";

const maxExcerptLength = 500;

export function drizzleNotificationRepository(tx: Transaction): NotificationRepository {
  return {
    replaceMentions: (source, text) => replaceMentions(tx, source, text),

    async record(recipientIds, notice) {
      const { targetType, targetId, linkPath, ...snapshot } = await snapshotOf(tx, notice.target);

      for (const recipientId of recipientIds) {
        await tx.insert(notifications).values({
          batchId: await batchFor(tx, recipientId, targetType, targetId),
          kind: notice.kind,
          actorId: notice.actorId,
          commentId: notice.commentId ?? null,
          ...snapshot,
          linkPath: notice.commentId ? `${linkPath}#comment-${notice.commentId}` : linkPath,
          excerpt: excerptOf(notice),
        });
      }
    },
  };
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

function snapshotOf(tx: Transaction, target: EventTarget) {
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
    targetType: "issue",
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
    targetType: "project",
    targetId: projectId,
    issueRef: null,
    issueTitle: null,
    projectName: project.name,
    projectKey: project.key,
    linkPath: `/project/${project.key}/detail`,
  };
}

async function batchFor(tx: Transaction, recipientId: string, targetType: string, targetId: string) {
  const [waiting] = await tx
    .select({ id: notificationBatches.id })
    .from(notificationBatches)
    .where(
      and(
        eq(notificationBatches.recipientId, recipientId),
        eq(notificationBatches.targetType, targetType),
        eq(notificationBatches.targetId, targetId),
        gt(notificationBatches.sendAfter, sql`now()`),
      ),
    )
    .limit(1);
  if (waiting) return waiting.id;

  return createBatch(tx, recipientId, targetType, targetId);
}

async function createBatch(tx: Transaction, recipientId: string, targetType: string, targetId: string) {
  const [batch] = await tx
    .insert(notificationBatches)
    .values({ recipientId, targetType, targetId, sendAfter: sql`now() + interval '2 minutes'` })
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