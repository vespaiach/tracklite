import { ResetLinkLookup } from "../../../schemas/account";
import { apiRoute } from "../../../server/api-route";
import { checkResetLink } from "../../../server/password-resets";

export const POST = apiRoute("public", ResetLinkLookup, async (_request, { token }) => {
  await checkResetLink(token);
  return new Response(null, { status: 204 });
});