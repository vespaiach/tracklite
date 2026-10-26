import "server-only";
import type { Transaction } from "./transaction";

export type EventTarget = { issueId: string } | { projectId: string };

export type DomainEvent =
  | { type: "IssueAssigned"; actorId: string; issueId: string; assigneeIds: string[] }
  | { type: "DescriptionSaved"; actorId: string; target: EventTarget; text: string }
  | { type: "CommentPosted"; actorId: string; target: EventTarget; commentId: string; text: string }
  | { type: "CommentEdited"; actorId: string; target: EventTarget; commentId: string; text: string };

type Subscriber = (tx: Transaction, event: DomainEvent) => Promise<void>;

let subscriber: Subscriber | undefined;

export function subscribe(handler: Subscriber) {
  subscriber = handler;
}

export async function publish(tx: Transaction, event: DomainEvent) {
  if (!subscriber) throw new Error(`No subscriber for ${event.type}: import the notifications context first`);
  await subscriber(tx, event);
}