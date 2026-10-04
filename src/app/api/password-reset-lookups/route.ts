import { apiRoute } from "../../../server/api-route";
import { checkResetLink } from "../../../server/password-resets";

export const POST = apiRoute("public", async (request) => {
  const body: { token?: unknown } = await request.json();
  await checkResetLink(String(body.token ?? ""));
  return new Response(null, { status: 204 });
});