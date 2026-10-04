import { randomInt } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { POST as requestLink } from "../app/api/password-reset-links/route";
import { db } from "../server/db";
import { outbox } from "../server/email/outbox";
import { passwordResetTokens } from "../server/schema";
import { hashToken } from "../server/tokens";

export function uniqueIp() {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(256)}`;
}

export function jsonRequest(
  method: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      "X-Forwarded-For": uniqueIp(),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

export function requestResetLink(email: string, headers?: Record<string, string>) {
  return requestLink(jsonRequest("POST", "/api/password-reset-links", { email }, headers));
}

export async function resetTokenFor(email: string) {
  const response = await requestResetLink(email);
  if (response.status !== 204) throw new Error(`Requesting a reset link answered ${response.status}`);
  const token = outbox.sent.at(-1)?.text.match(/token=(\S+)/)?.[1];
  if (!token) throw new Error("No reset email in the outbox");
  return token;
}

export async function ageResetLink(token: string, sinceSent: string) {
  await db
    .update(passwordResetTokens)
    .set({
      createdAt: sql`now() - ${sinceSent}::interval`,
      expiresAt: sql`now() - ${sinceSent}::interval + interval '30 minutes'`,
    })
    .where(eq(passwordResetTokens.tokenHash, hashToken(token)));
}