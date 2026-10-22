import { requestResetLink, ResetLinkRequest, clientIp } from "../../../server/identity";
import { apiRoute } from "../../../server/shared/api-route";

export const POST = apiRoute("public", ResetLinkRequest, async (request, { email }) => {
  await requestResetLink(email, clientIp(request));
  return new Response(null, { status: 204 });
});