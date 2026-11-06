import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  requireSession,
  sessionCookieName,
  sessionCookieOptions,
  signedInMemberBy,
} from "../../infrastructure/identity/session";
import { isInAppPath } from "../../lib/return-to";
import { requestPathHeader } from "../../proxy";

export async function sessionToken() {
  return (await cookies()).get(sessionCookieName())?.value;
}

export async function pageMember() {
  return signedInMemberBy(await sessionToken());
}

export const signedInPageMember = cache(async () => {
  const member = await pageMember();
  if (!member) redirect(await signInAddress());
  return member;
});

async function signInAddress() {
  const path = (await headers()).get(requestPathHeader);
  return isInAppPath(path) ? `/sign-in?next=${encodeURIComponent(path)}` : "/sign-in";
}

export async function actionMember() {
  const token = await sessionToken();
  const { member, renewed } = await requireSession(token);

  if (renewed && token) (await cookies()).set(sessionCookieName(), token, sessionCookieOptions());
  return member;
}

export async function startSessionCookie(token: string) {
  (await cookies()).set(sessionCookieName(), token, sessionCookieOptions());
}

export async function clearSessionCookie() {
  (await cookies()).set(sessionCookieName(), "", { ...sessionCookieOptions(), maxAge: 0 });
}