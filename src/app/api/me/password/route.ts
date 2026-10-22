import { changePassword, PasswordChange, readSessionToken } from "../../../../server/identity";
import { apiRoute } from "../../../../server/shared/api-route";
import { clientIp } from "../../../../server/shared/limits";

export const PUT = apiRoute("member", PasswordChange, async (request, member, change) => {
  await changePassword(member, readSessionToken(request) ?? "", change, clientIp(request));
  return new Response(null, { status: 204 });
});