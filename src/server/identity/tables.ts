import { sql } from "drizzle-orm";
import { check, index, inet, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { bytea, createdAt, id, notificationChannel, role, timestamptz } from "../shared/schema";

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
    notificationChannels: notificationChannel("notification_channels").array().notNull().default(["email"]),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("members_email_key").on(sql`lower(${t.email})`),
    check("members_notification_channels_not_empty", sql`cardinality(${t.notificationChannels}) > 0`),
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