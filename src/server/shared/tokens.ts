import "server-only";
import { createHash, randomBytes } from "node:crypto";

export function createToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest();
}