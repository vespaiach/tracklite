import { requestResetLink } from "../../../application/identity/request-reset-link";
import { clientIp } from "../../../infrastructure/identity/limits";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { apiRoute } from "../../../server/shared/api-route";
import { ResetLinkRequest } from "../../_server/schemas/identity";

export const POST = apiRoute("public", ResetLinkRequest, async (request, { email }) => {
  await requestResetLink(identityWork, { email, ip: clientIp(request) });
  return new Response(null, { status: 204 });
});