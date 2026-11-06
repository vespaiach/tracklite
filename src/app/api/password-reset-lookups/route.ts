import { checkResetLink } from "../../../application/identity/check-reset-link";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { apiRoute } from "../../../server/shared/api-route";
import { ResetLinkLookup } from "../../_server/schemas/identity";

export const POST = apiRoute("public", ResetLinkLookup, async (_request, { token }) => {
  await checkResetLink(identityWork, token);
  return new Response(null, { status: 204 });
});