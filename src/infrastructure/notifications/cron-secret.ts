import "server-only";
import { timingSafeEqual } from "node:crypto";
import { readConfig } from "../config";
import { hashToken } from "../tokens";

export function isCronCall(request: Request) {
  const secret = readConfig().cronSecret;
  if (secret === undefined) return false;

  const authorization = request.headers.get("authorization") ?? "";
  return timingSafeEqual(hashToken(authorization), hashToken(`Bearer ${secret}`));
}