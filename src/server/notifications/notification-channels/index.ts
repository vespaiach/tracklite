import "server-only";
import type { NotificationItem } from "../../shared/email/templates";
import type { members } from "../../identity";
import type { Result } from "../../shared/result";
import type { notificationChannel } from "../../shared/schema";
import { sendNotificationEmail } from "./email";

export type Recipient = typeof members.$inferSelect;
type NotificationChannel = (typeof notificationChannel.enumValues)[number];
type NotificationSender = (
  recipient: Recipient,
  items: NotificationItem[],
  deliveryId: string,
) => Promise<Result<{ providerMessageId: string }, "email-failed">>;

export const notificationSenders: Record<NotificationChannel, NotificationSender> = {
  email: sendNotificationEmail,
};