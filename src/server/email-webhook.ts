import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { readConfig } from "./config";
import { db } from "./db";
import { logEmailBounce } from "./log";
import { invitations, notificationEmails } from "./schema";

const toleranceSeconds = 5 * 60;

type EmailEvent = { type: string; data: { email_id: string } };

function isSigned(headers: Headers, body: string, secret: string | undefined) {
  const id = headers.get("svix-id");
  const timestamp = Number(headers.get("svix-timestamp"));
  const signatures = headers.get("svix-signature");
  if (!secret || !id || !signatures || !Number.isInteger(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(" ").some((entry) => {
    const [version, signature = ""] = entry.split(",");
    const given = Buffer.from(signature, "base64");
    return version === "v1" && given.length === expected.length && timingSafeEqual(given, expected);
  });
}

async function markBounced(providerMessageId: string) {
  const [notification] = await db
    .update(notificationEmails)
    .set({ state: "bounced" })
    .where(eq(notificationEmails.providerMessageId, providerMessageId))
    .returning({ id: notificationEmails.id });
  if (notification) return logEmailBounce(`email bounced, notification ${notification.id}`);

  const [invitation] = await db
    .update(invitations)
    .set({ bouncedAt: sql`now()` })
    .where(eq(invitations.providerMessageId, providerMessageId))
    .returning({ id: invitations.id });
  if (invitation) return logEmailBounce(`email bounced, invitation ${invitation.id}`);

  logEmailBounce("email bounced, untracked");
}

export async function receiveEmailEvent(headers: Headers, body: string) {
  if (!isSigned(headers, body, readConfig().resendWebhookSecret)) return false;
  const event: EmailEvent = JSON.parse(body);
  if (event.type === "email.bounced") await markBounced(event.data.email_id);
  return true;
}