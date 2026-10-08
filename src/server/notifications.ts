import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { toPlainText } from "../lib/markdown/parse";
import type { db } from "./db";
import { issues, notificationEmails, type notificationKind, notifications, projects } from "./schema";

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

async function snapshotOf(tx: Transaction, target: NotificationTarget) {
  if ("issueId" in target) {
    const [issue] = await tx
      .select({
        number: issues.number,
        title: issues.title,
        projectName: projects.name,
        projectKey: projects.key,
      })
      .from(issues)
      .innerJoin(projects, eq(projects.id, issues.projectId))
      .where(eq(issues.id, target.issueId));
    const issueRef = `${issue.projectKey}-${issue.number}`;
    return {
      targetType: "issue",
      targetId: target.issueId,
      issueRef,
      issueTitle: issue.title,
      projectName: issue.projectName,
      projectKey: issue.projectKey,
      linkPath: `/issue/${issueRef}`,
    };
  }
  const [project] = await tx
    .select({ name: projects.name, key: projects.key })
    .from(projects)
    .where(eq(projects.id, target.projectId));
  return {
    targetType: "project",
    targetId: target.projectId,
    issueRef: null,
    issueTitle: null,
    projectName: project.name,
    projectKey: project.key,
    linkPath: `/project/${project.key}/detail`,
  };
}

async function emailFor(tx: Transaction, recipientId: string, targetType: string, targetId: string) {
  const [waiting] = await tx
    .select({ id: notificationEmails.id })
    .from(notificationEmails)
    .where(
      and(
        eq(notificationEmails.recipientId, recipientId),
        eq(notificationEmails.targetType, targetType),
        eq(notificationEmails.targetId, targetId),
        eq(notificationEmails.state, "pending"),
        gt(notificationEmails.sendAfter, sql`now()`),
      ),
    )
    .limit(1);
  if (waiting) return waiting.id;
  const [created] = await tx
    .insert(notificationEmails)
    .values({
      recipientId,
      targetType,
      targetId,
      sendAfter: sql`now() + interval '2 minutes'`,
      state: "pending",
    })
    .returning({ id: notificationEmails.id });
  return created.id;
}

export async function notify(tx: Transaction, recipientIds: string[], notice: Notice) {
  const recipients = recipientIds.filter((recipientId) => recipientId !== notice.actorId);
  if (recipients.length === 0) return;
  const { targetType, targetId, linkPath, ...snapshot } = await snapshotOf(tx, notice.target);
  for (const recipientId of recipients) {
    await tx.insert(notifications).values({
      emailId: await emailFor(tx, recipientId, targetType, targetId),
      kind: notice.kind,
      actorId: notice.actorId,
      commentId: notice.commentId ?? null,
      ...snapshot,
      linkPath: notice.commentId ? `${linkPath}#comment-${notice.commentId}` : linkPath,
      excerpt: notice.text === undefined ? "" : excerptOf(notice.text),
    });
  }
}