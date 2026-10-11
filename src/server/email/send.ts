import "server-only";
import { readConfig } from "../config";
import type { Email } from "./outbox";
import { productionEmailProvider } from "./production";
import { mailpit } from "./providers/mailpit";
import { inMemoryOutbox } from "./providers/outbox";

type SendRequest = Email & { idempotencyKey?: string };

export async function sendEmail(email: SendRequest): Promise<{ providerMessageId: string }> {
  const config = readConfig();
  return providerFor(process.env.NODE_ENV).send(
    { ...email, from: config.emailFrom },
    { apiKey: config.emailApiKey },
  );
}

function providerFor(nodeEnv: string | undefined) {
  if (nodeEnv === "test") return inMemoryOutbox;
  if (nodeEnv === "production") return productionEmailProvider;
  return mailpit;
}