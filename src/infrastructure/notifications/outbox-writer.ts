import "server-only";
import { writeEvent } from "../../application/notifications/write-event";
import type { DomainEvent } from "../../domain/shared/events";
import type { Transaction } from "../transaction";
import { drizzleOutboxWriter } from "./drizzle-notification-repository";

export async function writeOutbox(tx: Transaction, events: DomainEvent[]) {
  const outbox = drizzleOutboxWriter(tx);
  for (const event of events) await writeEvent(outbox, event);
}