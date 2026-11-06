import "server-only";
import { sendEmail } from "../../../infrastructure/email/send";
import { type NotificationItem, notificationEmail } from "../../../infrastructure/email/templates";
import type { Recipient } from "./index";

export function sendNotificationEmail(recipient: Recipient, items: NotificationItem[], deliveryId: string) {
  return sendEmail({ to: recipient.email, ...notificationEmail(items), idempotencyKey: deliveryId });
}