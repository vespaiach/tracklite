import type { NotificationRepository, OutboxEvent } from "../../domain/notifications/notification-repository";

export async function recordNotifications(notifications: NotificationRepository, event: OutboxEvent) {
  for (const recipientId of event.payload.recipientIds) await notifications.record(event, recipientId);
}