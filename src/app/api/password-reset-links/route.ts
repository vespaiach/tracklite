import { apiRoute } from "../../../server/api-route";
import { clientIp } from "../../../server/limits";
import { requestResetLink } from "../../../server/password-resets";

export const POST = apiRoute("public", async (request) => {
  const body: { email?: unknown } = await request.json();
  await requestResetLink(String(body.email ?? ""), clientIp(request));
  return new Response(null, { status: 204 });
});