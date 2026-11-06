"use server";

import { headers } from "next/headers";
import { requestResetLink as sendResetLink } from "../../../application/identity/request-reset-link";
import { clientIp } from "../../../infrastructure/identity/limits";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { action } from "../../_server/action";
import { ResetLinkRequest } from "../../_server/schemas/identity";

export const requestResetLink = action("requestResetLink", "public", ResetLinkRequest, async ({ email }) => {
  await sendResetLink(identityWork, { email, ip: clientIp(await headers()) });
  return null;
});