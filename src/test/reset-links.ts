import { randomInt } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { requestResetLink } from "../application/identity/request-reset-link";
import { db } from "../infrastructure/db";
import { outbox } from "../infrastructure/email/outbox";
import { identityWork } from "../infrastructure/identity/repositories";
import { passwordResetTokens } from "../infrastructure/identity/tables";
import { hashToken } from "../infrastructure/tokens";

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

export async function resetTokenFor(email: string) {
  await requestResetLink(identityWork, { email, ip: uniqueIp() });
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