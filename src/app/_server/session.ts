import "server-only";
import { cookies } from "next/headers";
import {
  requireSession,
  sessionCookieName,
  sessionCookieOptions,
  signedInMemberBy,
} from "../../infrastructure/identity/session";

async function sessionToken() {
  return (await cookies()).get(sessionCookieName())?.value;
}

export async function pageMember() {
  return signedInMemberBy(await sessionToken());
}

export async function actionMember() {
  const token = await sessionToken();
  const { member, renewed } = await requireSession(token);

  if (renewed && token) (await cookies()).set(sessionCookieName(), token, sessionCookieOptions());
  return member;
}