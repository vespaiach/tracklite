import { PasswordChange } from "../../../../schemas/account";
import { apiRoute } from "../../../../server/shared/api-route";
import { clientIp } from "../../../../server/shared/limits";
import { changePassword } from "../../../../server/profile";
import { readSessionToken } from "../../../../server/sessions";

export const PUT = apiRoute("member", PasswordChange, async (request, member, change) => {
  await changePassword(member, readSessionToken(request) ?? "", change, clientIp(request));
  return new Response(null, { status: 204 });
});