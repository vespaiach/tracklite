import "server-only";
import type { NotificationSender } from "../../../application/notifications/send-due-deliveries";
import { sendEmail } from "../../email/send";
import { notificationEmail } from "../../email/templates";

export const sendNotificationEmail: NotificationSender = (recipient, items, deliveryId) =>
  sendEmail({ to: recipient.email, ...notificationEmail(items), idempotencyKey: deliveryId });