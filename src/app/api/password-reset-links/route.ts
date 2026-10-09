import { ResetLinkRequest } from "../../../schemas/account";
import { apiRoute } from "../../../server/api-route";
import { clientIp } from "../../../server/limits";
import { requestResetLink } from "../../../server/password-resets";

export const POST = apiRoute("public", ResetLinkRequest, async (request, { email }) => {
  await requestResetLink(email, clientIp(request));
  return new Response(null, { status: 204 });
});