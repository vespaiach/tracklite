import { signIn } from "../app/(signed-out)/sign-in/actions";
import type { ActionResult } from "../contract";
import { setNextRequest, writtenCookies } from "./next-request";
import { uniqueIp } from "./reset-links";

export function outcome(result: ActionResult<unknown>) {
  return result.ok ? "ok" : result.error.kind;
}

export function fromNewIp(cookies: Record<string, string> = {}) {
  setNextRequest({ cookies, headers: { "x-forwarded-for": uniqueIp() } });
}

export async function signInAs(email: string, password: string) {
  fromNewIp();
  return signIn({ email, password });
}

export function sessionCookieWritten() {
  const written = writtenCookies().at(-1);
  return written && `${written.name}=${written.value}`;
}