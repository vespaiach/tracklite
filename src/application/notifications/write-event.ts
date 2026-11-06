import type { MentionSource, Notice, OutboxWriter } from "../../domain/notifications/notification-repository";
import type { DomainEvent, EventTarget } from "../../domain/shared/events";

export async function writeEvent(outbox: OutboxWriter, event: DomainEvent) {
  if (event.type === "IssueAssigned") {
    await keep(outbox, event.type, event.assigneeIds, {
      kind: "assigned",
      actorId: event.actorId,
      target: { issueId: event.issueId },
    });
    return;
  }

  const commentId = event.type === "DescriptionSaved" ? undefined : event.commentId;
  const mentioned = await outbox.replaceMentions(mentionSourceOf(event.target, commentId), event.text);

  await keep(outbox, event.type, mentioned, {
    kind: "mentioned",
    actorId: event.actorId,
    target: event.target,
    commentId,
    text: event.text,
  });
}

async function keep(outbox: OutboxWriter, type: DomainEvent["type"], recipientIds: string[], notice: Notice) {
  const recipients = recipientIds.filter((recipientId) => recipientId !== notice.actorId);
  if (recipients.length === 0) return;

  await outbox.add(type, recipients, notice);
}

function mentionSourceOf(target: EventTarget, commentId: string | undefined): MentionSource {
  return commentId === undefined ? target : { commentId };
}