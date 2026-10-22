import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { readConfig } from "./shared/config";
import { db } from "./shared/db";
import { logEmailEvent } from "./shared/log";
import { invitations, notificationDeliveries } from "./shared/schema";

const toleranceSeconds = 5 * 60;

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

async function markBounced(providerMessageId: string) {
  const [notification] = await db
    .update(notificationDeliveries)
    .set({ state: "bounced", stateChangedAt: sql`now()` })
    .where(
      and(
        eq(notificationDeliveries.channel, "email"),
        eq(notificationDeliveries.providerMessageId, providerMessageId),
      ),
    )
    .returning({ id: notificationDeliveries.id });
  if (notification) return logEmailEvent(`email bounced, notification ${notification.id}`);

  const [invitation] = await db
    .update(invitations)
    .set({ bouncedAt: sql`now()` })
    .where(eq(invitations.providerMessageId, providerMessageId))
    .returning({ id: invitations.id });
  if (invitation) return logEmailEvent(`email bounced, invitation ${invitation.id}`);

  logEmailEvent("email bounced, untracked");
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bouncedMessageId(event: Record<string, unknown>) {
  if (!isRecord(event.data)) return undefined;
  const messageId = event.data.email_id;
  return typeof messageId === "string" && messageId !== "" ? messageId : undefined;
}

async function handleEvent(event: unknown) {
  if (!isRecord(event)) return logEmailEvent("email event ignored");
  if (event.type !== "email.bounced") return;

  const messageId = bouncedMessageId(event);
  if (!messageId) return logEmailEvent("email event ignored");

  await markBounced(messageId);
}

export async function receiveEmailEvent(headers: Headers, body: string) {
  if (!isSigned(headers, body, readConfig().resendWebhookSecret)) return false;

  await handleEvent(parseJson(body));

  return true;
}