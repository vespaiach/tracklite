import { customType, pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";
import { issuePriorities, issueStatuses, labelColors, notificationChannels, roles } from "../../contract";

export const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
export const byteOrderedText = customType<{ data: string }>({ dataType: () => 'text COLLATE "C"' });

export const id = () => uuid("id").primaryKey().defaultRandom();
export const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
export const createdAt = () => timestamptz("created_at").notNull().defaultNow();

export const role = pgEnum("role", roles);
export const issueStatus = pgEnum("issue_status", issueStatuses);
export const issuePriority = pgEnum("issue_priority", issuePriorities);
export const labelColor = pgEnum("label_color", labelColors);
export const notificationKind = pgEnum("notification_kind", ["assigned", "mentioned"]);
export const deliveryState = pgEnum("delivery_state", ["pending", "sent", "dropped", "failed", "bounced"]);
export const notificationChannel = pgEnum("notification_channel", notificationChannels);