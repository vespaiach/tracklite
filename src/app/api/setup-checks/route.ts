import { checkSetupSecret, SetupCheck } from "../../../server/identity";
import { apiRoute } from "../../../server/shared/api-route";

export const POST = apiRoute("public", SetupCheck, async (_request, { secret }) => {
  await checkSetupSecret(secret);
  return new Response(null, { status: 204 });
});