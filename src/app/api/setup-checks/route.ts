import { checkSetupSecret } from "../../../application/identity/check-setup-secret";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { SetupCheck } from "../../../server/identity";
import { apiRoute } from "../../../server/shared/api-route";

export const POST = apiRoute("public", SetupCheck, async (_request, { secret }) => {
  await checkSetupSecret(identityWork, secret);
  return new Response(null, { status: 204 });
});