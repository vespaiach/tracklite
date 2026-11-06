"use server";

import { headers } from "next/headers";
import { signIn as startSession } from "../../../application/identity/sign-in";
import { clientIp } from "../../../infrastructure/identity/limits";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { action } from "../../_server/action";
import { SignIn } from "../../_server/schemas/identity";
import { startSessionCookie } from "../../_server/session";

export const signIn = action("signIn", "public", SignIn, async ({ email, password }, nameActor) => {
  const ip = clientIp(await headers());
  const { token, username } = await startSession(identityWork, { email, password, ip });
  nameActor(username);

  await startSessionCookie(token);
  return null;
});