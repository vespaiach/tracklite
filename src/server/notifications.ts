import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { toPlainText } from "../lib/markdown/parse";
import type { db } from "./db";
import {
  issues,
  members,
  notificationBatches,
  notificationDeliveries,
  type notificationKind,
  notifications,
  projects,
} from "./schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type NotificationKind = (typeof notificationKind.enumValues)[number];
type NotificationTarget = { issueId: string } | { projectId: string };
type Notice = {
  kind: NotificationKind;
  actorId: string;
  target: NotificationTarget;
  commentId?: string;
  text?: string;
};

const maxExcerptLength = 500;

function excerptOf(markdown: string) {
  const characters = [...toPlainText(markdown).replace(/\s+/g, " ").trim()];
  if (characters.length <= maxExcerptLength) return characters.join("");
  return `${characters.slice(0, maxExcerptLength).join("")}…`;
}

function snapshotOf(tx: Transaction, target: NotificationTarget) {
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

export async function notify(tx: Transaction, recipientIds: string[], notice: Notice) {
  const recipients = recipientIds.filter((recipientId) => recipientId !== notice.actorId);
  if (recipients.length === 0) return;

  const { targetType, targetId, linkPath, ...snapshot } = await snapshotOf(tx, notice.target);

  for (const recipientId of recipients) {
    await tx.insert(notifications).values({
      batchId: await batchFor(tx, recipientId, targetType, targetId),
      kind: notice.kind,
      actorId: notice.actorId,
      commentId: notice.commentId ?? null,
      ...snapshot,
      linkPath: notice.commentId ? `${linkPath}#comment-${notice.commentId}` : linkPath,
      excerpt: notice.text === undefined ? "" : excerptOf(notice.text),
    });
  }
}