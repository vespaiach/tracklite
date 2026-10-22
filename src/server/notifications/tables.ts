import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  createdAt,
  deliveryState,
  id,
  notificationChannel,
  notificationKind,
  timestamptz,
} from "../shared/schema";
import { comments } from "../comments/tables";
import { members } from "../identity/tables";
import { issues } from "../issues/tables";
import { projects } from "../projects/tables";

export const mentions = pgTable(
  "mentions",
  {
    id: id(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
  },
  (t) => [
    check("mentions_one_source", sql`num_nonnulls(${t.issueId}, ${t.projectId}, ${t.commentId}) = 1`),
    uniqueIndex("mentions_member_issue_key").on(t.memberId, t.issueId),
    uniqueIndex("mentions_member_project_key").on(t.memberId, t.projectId),
    uniqueIndex("mentions_member_comment_key").on(t.memberId, t.commentId),
  ],
);

export const notificationBatches = pgTable(
  "notification_batches",
  {
    id: id(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => members.id),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    sendAfter: timestamptz("send_after").notNull(),
    createdAt: createdAt(),
  },
  (t) => [check("notification_batches_target_type", sql`${t.targetType} in ('issue', 'project')`)],
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: id(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => notificationBatches.id, { onDelete: "cascade" }),
    channel: notificationChannel("channel").notNull(),
    state: deliveryState("state").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamptz("next_attempt_at"),
    lockedUntil: timestamptz("locked_until"),
    providerMessageId: text("provider_message_id"),
    createdAt: createdAt(),
    sentAt: timestamptz("sent_at"),
    stateChangedAt: timestamptz("state_changed_at"),
  },
  (t) => [
    uniqueIndex("notification_deliveries_batch_channel_key").on(t.batchId, t.channel),
    index("notification_deliveries_pending_idx").on(t.batchId).where(sql`${t.state} = 'pending'`),
  ],
);

export const workerHeartbeats = pgTable("worker_heartbeats", {
  name: text("name").primaryKey(),
  lastPassAt: timestamptz("last_pass_at").notNull(),
});

export const notifications = pgTable("notifications", {
  id: id(),
  batchId: uuid("batch_id")
    .notNull()
    .references(() => notificationBatches.id, { onDelete: "cascade" }),
  kind: notificationKind("kind").notNull(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => members.id),
  commentId: uuid("comment_id"),
  dropped: boolean("dropped").notNull().default(false),
  createdAt: createdAt(),
  issueRef: text("issue_ref"),
  issueTitle: text("issue_title"),
  projectName: text("project_name").notNull(),
  projectKey: text("project_key").notNull(),
  linkPath: text("link_path").notNull(),
  excerpt: text("excerpt").notNull(),
});