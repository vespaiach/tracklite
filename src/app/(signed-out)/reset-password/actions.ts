"use server";

import { resetPassword as setNewPassword } from "../../../application/identity/reset-password";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { action } from "../../_server/action";
import { PasswordReset } from "../../_server/schemas/identity";
import { startSessionCookie } from "../../_server/session";

export const resetPassword = action("resetPassword", "public", PasswordReset, async (reset) => {
  await startSessionCookie(await setNewPassword(identityWork, reset));
  return null;
});