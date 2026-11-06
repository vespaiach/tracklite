"use server";

import { checkSetupSecret as checkSecret } from "../../../application/identity/check-setup-secret";
import { createFirstAdmin as addFirstAdmin } from "../../../application/identity/create-first-admin";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { action } from "../../_server/action";
import { FirstAdmin, SetupCheck } from "../../_server/schemas/identity";
import { startSessionCookie } from "../../_server/session";

export const checkSetupSecret = action("checkSetupSecret", "public", SetupCheck, async ({ secret }) => {
  await checkSecret(identityWork, secret);
  return null;
});

export const createFirstAdmin = action(
  "createFirstAdmin",
  "public",
  FirstAdmin,
  async (firstAdmin, nameActor) => {
    const { username, sessionToken } = await addFirstAdmin(identityWork, firstAdmin);
    nameActor(username.value);

    await startSessionCookie(sessionToken);
    return null;
  },
);