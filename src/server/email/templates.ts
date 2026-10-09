import "server-only";
import { readConfig } from "../config";

const signature = "\n\n— Tracklite";

export function passwordResetEmail({ email, token }: { email: string; token: string }) {
  return {
    subject: "Reset your Tracklite password",
    text:
      [
        `Someone asked to reset the password for ${email} on Tracklite.`,
        "",
        `Choose a new password: ${readConfig().appUrl}/reset-password?token=${token}`,
        "",
        "This link works once and expires in 30 minutes. If you didn't ask for this, ignore this email; your password hasn't changed.",
      ].join("\n") + signature,
  };
}

export function invitationEmail({ inviterName, token }: { inviterName: string; token: string }) {
  return {
    subject: `${inviterName} invited you to Tracklite`,
    text:
      [
        `${inviterName} invited you to join their team on Tracklite.`,
        "",
        `Accept the invitation: ${readConfig().appUrl}/invite?token=${token}`,
        "",
        "This link works once and expires in 7 days. If you weren't expecting this, you can ignore this email.",
      ].join("\n") + signature,
  };
}

type NotificationItem = {
  kind: "assigned" | "mentioned";
  actorName: string;
  commentId: string | null;
  issueRef: string | null;
  issueTitle: string | null;
  projectName: string;
  projectKey: string;
  linkPath: string;
  excerpt: string;
};

function notificationBody(item: NotificationItem) {
  const link = `${readConfig().appUrl}${item.linkPath}`;

  if (item.kind === "assigned") {
    return [`${item.actorName} assigned ${item.issueRef} to you in ${item.projectName}.`, "", link].join(
      "\n",
    );
  }

  const place = item.commentId ? "a comment on" : "the description of";
  const target = item.issueRef ? `${item.issueRef} (${item.projectName})` : `project ${item.projectName}`;
  return [`${item.actorName} mentioned you in ${place} ${target}:`, "", item.excerpt, "", link].join("\n");
}

export function notificationEmail(items: NotificationItem[]) {
  return {
    subject: `${notificationHeading(items[items.length - 1])}: ${updateSummary(items)}`,
    text: items.map(notificationBody).join("\n\n---\n\n") + signature,
  };
}

function notificationHeading(newest: NotificationItem) {
  return newest.issueRef
    ? `[${newest.issueRef}] ${newest.issueTitle}`
    : `[${newest.projectKey}] ${newest.projectName}`;
}

function updateSummary(items: NotificationItem[]) {
  const newest = items[items.length - 1];
  if (items.length > 1) return `${items.length} updates for you`;
  if (newest.kind === "assigned") return `assigned to you by ${newest.actorName}`;
  return `${newest.actorName} mentioned you`;
}