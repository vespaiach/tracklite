"use server";

import * as v from "valibot";
import { signOut as endSession } from "../../application/identity/sign-out";
import { identityWork } from "../../infrastructure/identity/repositories";
import { action } from "../_server/action";
import { clearSessionCookie, sessionToken } from "../_server/session";

export const signOut = action("signOut", "public", v.object({}), async () => {
  const token = await sessionToken();
  if (token) await endSession(identityWork, token);

  await clearSessionCookie();
  return null;
});