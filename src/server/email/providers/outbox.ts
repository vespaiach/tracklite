import "server-only";
import { outbox } from "../outbox";
import type { EmailProvider, OutgoingEmail } from "../provider";

async function send({ to, subject, text }: OutgoingEmail) {
  if (outbox.failing) throw new Error("Email send failed");
  outbox.sent.push({ to, subject, text });
  return { providerMessageId: `outbox-${outbox.sent.length}` };
}

export const inMemoryOutbox: EmailProvider = { send };