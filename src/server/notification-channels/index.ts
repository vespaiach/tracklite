import "server-only";
import type { NotificationItem } from "../email/templates";
import type { members, notificationChannel } from "../schema";
import { sendNotificationEmail } from "./email";

export type Recipient = typeof members.$inferSelect;
type NotificationChannel = (typeof notificationChannel.enumValues)[number];
type NotificationSender = (
  recipient: Recipient,
  items: NotificationItem[],
  deliveryId: string,
) => Promise<{ providerMessageId: string }>;

export const notificationSenders: Record<NotificationChannel, NotificationSender> = {
  email: sendNotificationEmail,
};