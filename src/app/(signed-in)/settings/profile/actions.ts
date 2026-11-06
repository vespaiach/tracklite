"use server";

import { headers } from "next/headers";
import { changePassword as change } from "../../../../application/identity/change-password";
import { updateProfile as update } from "../../../../application/identity/update-profile";
import { clientIp } from "../../../../infrastructure/identity/limits";
import { identityWork } from "../../../../infrastructure/identity/repositories";
import { action } from "../../../_server/action";
import { PasswordChange, ProfileChanges } from "../../../_server/schemas/identity";
import { sessionToken } from "../../../_server/session";

export const updateProfile = action("updateProfile", "member", ProfileChanges, async (actor, changes) => {
  await update(actor, identityWork, changes);
  return null;
});

export const changePassword = action("changePassword", "member", PasswordChange, async (actor, passwords) => {
  await change(actor, identityWork, {
    ...passwords,
    sessionToken: (await sessionToken()) ?? "",
    ip: clientIp(await headers()),
  });
  return null;
});