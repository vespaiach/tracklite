import "server-only";
import type { DomainEvent } from "../domain/shared/events";
import type { Transaction } from "./transaction";

type Subscriber = (tx: Transaction, event: DomainEvent) => Promise<void>;

let subscriber: Subscriber | undefined;

export function subscribe(handler: Subscriber) {
  subscriber = handler;
}

export async function publish(tx: Transaction, event: DomainEvent) {
  if (!subscriber) throw new Error(`No subscriber for ${event.type}: import the notifications context first`);
  await subscriber(tx, event);
}

export async function publishAll(tx: Transaction, events: DomainEvent[]) {
  for (const event of events) await publish(tx, event);
}