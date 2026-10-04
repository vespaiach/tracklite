import { apiRoute } from "../../../server/api-route";
import { clientIp } from "../../../server/limits";
import { sessionCookie } from "../../../server/sessions";
import { signIn } from "../../../server/sign-in";

export const POST = apiRoute("public", async (request) => {
  const body: { email?: unknown; password?: unknown } = await request.json();
  const token = await signIn(String(body.email ?? ""), String(body.password ?? ""), clientIp(request));
  return new Response(null, { status: 204, headers: { "set-cookie": sessionCookie(token) } });
});