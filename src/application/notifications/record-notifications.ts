import type {
  MentionSource,
  Notice,
  NotificationRepository,
} from "../../domain/notifications/notification-repository";
import type { DomainEvent, EventTarget } from "../../domain/shared/events";

export async function recordNotifications(notifications: NotificationRepository, event: DomainEvent) {
  if (event.type === "IssueAssigned") {
    await notify(notifications, event.assigneeIds, {
      kind: "assigned",
      actorId: event.actorId,
      target: { issueId: event.issueId },
    });
    return;
  }

  const commentId = event.type === "DescriptionSaved" ? undefined : event.commentId;
  const mentioned = await notifications.replaceMentions(mentionSourceOf(event.target, commentId), event.text);

  await notify(notifications, mentioned, {
    kind: "mentioned",
    actorId: event.actorId,
    target: event.target,
    commentId,
    text: event.text,
  });
}

async function notify(notifications: NotificationRepository, recipientIds: string[], notice: Notice) {
  const recipients = recipientIds.filter((recipientId) => recipientId !== notice.actorId);
  if (recipients.length === 0) return;

  await notifications.record(recipients, notice);
}

function mentionSourceOf(target: EventTarget, commentId: string | undefined): MentionSource {
  return commentId === undefined ? target : { commentId };
}