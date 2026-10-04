import { apiRoute } from "../../../server/api-route";
import { resetPassword } from "../../../server/password-resets";
import { sessionCookie } from "../../../server/sessions";

export const POST = apiRoute("public", async (request) => {
  const body: { token?: unknown; password?: unknown } = await request.json();
  const token = await resetPassword(String(body.token ?? ""), String(body.password ?? ""));
  return new Response(null, { status: 204, headers: { "set-cookie": sessionCookie(token) } });
});