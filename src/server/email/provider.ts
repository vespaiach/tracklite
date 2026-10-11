import "server-only";
import type { Email } from "./outbox";

export type OutgoingEmail = Email & { from: string; idempotencyKey?: string };
export type BounceReport = "unsigned" | { bouncedMessageId: string | null };

export type EmailProvider = {
  send(email: OutgoingEmail, settings: { apiKey?: string }): Promise<{ providerMessageId: string }>;
};

export type ProductionEmailProvider = EmailProvider & {
  readBounceReport(headers: Headers, body: string, settings: { webhookSecret?: string }): BounceReport;
};

export const sendTimeoutMs = 10_000;