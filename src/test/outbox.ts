import { publishNextEvent } from "../infrastructure/notifications/run-outbox";

export async function recordEvents() {
  while (await publishNextEvent()) {}
}