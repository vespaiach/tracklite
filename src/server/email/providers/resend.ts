import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { logEmailFailure } from "../../log";
import {
  type BounceReport,
  type OutgoingEmail,
  type ProductionEmailProvider,
  sendTimeoutMs,
} from "../provider";

type ResendEvent = { type: string; data: { email_id: string } };

const toleranceSeconds = 5 * 60;

async function send(email: OutgoingEmail, { apiKey }: { apiKey?: string }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey } : {}),
    },
    body: JSON.stringify({ from: email.from, to: [email.to], subject: email.subject, text: email.text }),
    signal: AbortSignal.timeout(sendTimeoutMs),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    logEmailFailure({ status: response.status, errorName: body.name });
    throw new Error(`Resend answered ${response.status}`);
  }
  return { providerMessageId: body.id as string };
}

function readBounceReport(
  headers: Headers,
  body: string,
  { webhookSecret }: { webhookSecret?: string },
): BounceReport {
  if (!isSigned(headers, body, webhookSecret)) return "unsigned";
  const event: ResendEvent = JSON.parse(body);
  return { bouncedMessageId: event.type === "email.bounced" ? event.data.email_id : null };
}

function isSigned(headers: Headers, body: string, secret: string | undefined) {
  const id = headers.get("svix-id");
  const timestamp = Number(headers.get("svix-timestamp"));
  const signatures = headers.get("svix-signature");

  if (!secret || !id || !signatures || !Number.isInteger(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;

  const expected = expectedSignature(secret, `${id}.${timestamp}.${body}`);

  return hasSignature(signatures, expected);
}

function expectedSignature(secret: string, signedContent: string) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key).update(signedContent).digest();
}

function hasSignature(signatures: string, expected: Buffer) {
  return signatures.split(" ").some((entry) => {
    const [version, signature = ""] = entry.split(",");
    const given = Buffer.from(signature, "base64");
    return version === "v1" && given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export const resend: ProductionEmailProvider = { send, readBounceReport };