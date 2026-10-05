import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  inet,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

const id = () => uuid("id").primaryKey().defaultRandom();
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => timestamptz("created_at").notNull().defaultNow();

export const role = pgEnum("role", ["admin", "member"]);
export const issueStatus = pgEnum("issue_status", [
  "backlog",
  "in_progress",
  "in_review",
  "done",
  "canceled",
]);
export const issuePriority = pgEnum("issue_priority", ["urgent", "high", "medium", "low", "none"]);
export const labelColor = pgEnum("label_color", [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
]);
export const notificationKind = pgEnum("notification_kind", ["assigned", "mentioned"]);
export const emailState = pgEnum("email_state", ["pending", "sent", "dropped", "failed", "bounced"]);

export const members = pgTable(
  "members",
  {
    id: id(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: role("role").notNull(),
    deactivatedAt: timestamptz("deactivated_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("members_email_key").on(sql`lower(${t.email})`),
    uniqueIndex("members_username_key").on(t.username),
    check("members_username_format", sql`${t.username} ~ '^[a-z0-9-]{2,20}$'`),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    email: text("email").notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => members.id),
    tokenHash: bytea("token_hash").notNull().unique(),
    expiresAt: timestamptz("expires_at").notNull(),
    acceptedAt: timestamptz("accepted_at"),
    revokedAt: timestamptz("revoked_at"),
    bouncedAt: timestamptz("bounced_at"),
    providerMessageId: text("provider_message_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invitations_open_email_key")
      .on(sql`lower(${t.email})`)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
  ],
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: id(),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  tokenHash: bytea("token_hash").notNull().unique(),
  expiresAt: timestamptz("expires_at").notNull(),
  usedAt: timestamptz("used_at"),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  id: id(),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  tokenHash: bytea("token_hash").notNull().unique(),
  lastActiveAt: timestamptz("last_active_at").notNull().defaultNow(),
  createdAt: createdAt(),
});

export const signInAttempts = pgTable(
  "sign_in_attempts",
  {
    email: text("email").notNull(),
    ip: inet("ip").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("sign_in_attempts_email_idx").on(t.email, t.createdAt),
    index("sign_in_attempts_ip_idx").on(t.ip, t.createdAt),
  ],
);

export const passwordResetRequests = pgTable(
  "password_reset_requests",
  {
    email: text("email").notNull(),
    ip: inet("ip").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("password_reset_requests_email_idx").on(t.email, t.createdAt),
    index("password_reset_requests_ip_idx").on(t.ip, t.createdAt),
  ],
);

export const projectKeys = pgTable("project_keys", {
  key: text("key").primaryKey(),
});

export const projects = pgTable(
  "projects",
  {
    id: id(),
    key: text("key")
      .notNull()
      .unique()
      .references(() => projectKeys.key),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    descriptionVersion: integer("description_version").notNull().default(0),
    descriptionEditedBy: uuid("description_edited_by").references(() => members.id),
    nextIssueNumber: integer("next_issue_number").notNull().default(1),
    archivedAt: timestamptz("archived_at"),
    createdAt: createdAt(),
  },
  (t) => [check("projects_key_format", sql`${t.key} ~ '^[A-Z]{2,5}$'`)],
);

export const labels = pgTable(
  "labels",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: labelColor("color").notNull(),
  },
  (t) => [uniqueIndex("labels_project_name_key").on(t.projectId, sql`lower(${t.name})`)],
);

export const issues = pgTable(
  "issues",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    descriptionVersion: integer("description_version").notNull().default(0),
    descriptionEditedBy: uuid("description_edited_by").references(() => members.id),
    status: issueStatus("status").notNull(),
    priority: issuePriority("priority").notNull(),
    assigneeId: uuid("assignee_id").references(() => members.id),
    position: text("position").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => members.id),
    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    statusChangedAt: timestamptz("status_changed_at").notNull().defaultNow(),
    requestId: uuid("request_id").notNull().unique(),
  },
  (t) => [
    uniqueIndex("issues_project_number_key").on(t.projectId, t.number),
    index("issues_board_idx").on(t.projectId, t.status, t.position),
    index("issues_updated_idx").on(t.projectId, t.updatedAt.desc()),
    index("issues_assignee_idx").on(t.assigneeId, t.status),
    index("issues_title_trgm_idx").using("gin", t.title.op("gin_trgm_ops")),
    index("issues_description_trgm_idx").using("gin", t.description.op("gin_trgm_ops")),
  ],
);

export const issueLabels = pgTable(
  "issue_labels",
  {
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.issueId, t.labelId] })],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => members.id),
    body: text("body").notNull(),
    version: integer("version").notNull().default(0),
    createdAt: createdAt(),
    editedAt: timestamptz("edited_at"),
    requestId: uuid("request_id").notNull().unique(),
  },
  (t) => [
    check("comments_one_parent", sql`num_nonnulls(${t.issueId}, ${t.projectId}) = 1`),
    index("comments_issue_idx").on(t.issueId, t.createdAt),
    index("comments_project_idx").on(t.projectId, t.createdAt),
  ],
);

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

export const notificationEmails = pgTable(
  "notification_emails",
  {
    id: id(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => members.id),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    sendAfter: timestamptz("send_after").notNull(),
    state: emailState("state").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamptz("next_attempt_at"),
    providerMessageId: text("provider_message_id"),
    createdAt: createdAt(),
    sentAt: timestamptz("sent_at"),
  },
  (t) => [check("notification_emails_target_type", sql`${t.targetType} in ('issue', 'project')`)],
);

export const notifications = pgTable("notifications", {
  id: id(),
  emailId: uuid("email_id")
    .notNull()
    .references(() => notificationEmails.id, { onDelete: "cascade" }),
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