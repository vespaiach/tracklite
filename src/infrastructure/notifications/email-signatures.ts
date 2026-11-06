import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readConfig } from "../config";

const toleranceSeconds = 5 * 60;

export function isSignedEmailEvent(headers: Headers, body: string) {
  const secret = readConfig().resendWebhookSecret;
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