import { changePassword } from "../../../../application/identity/change-password";
import { clientIp } from "../../../../infrastructure/identity/limits";
import { identityWork } from "../../../../infrastructure/identity/repositories";
import { readSessionToken } from "../../../../infrastructure/identity/session";
import { PasswordChange } from "../../../_server/schemas/identity";
import { apiRoute } from "../../../../server/shared/api-route";

export const PUT = apiRoute("member", PasswordChange, async (request, member, change) => {
  await changePassword(member, identityWork, {
    ...change,
    sessionToken: readSessionToken(request) ?? "",
    ip: clientIp(request.headers),
  });
  return new Response(null, { status: 204 });
});