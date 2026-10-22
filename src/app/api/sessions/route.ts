import { sessionCookie, SignIn, signIn } from "../../../server/identity";
import { apiRoute } from "../../../server/shared/api-route";
import { clientIp } from "../../../server/shared/limits";

export const POST = apiRoute("public", SignIn, async (request, { email, password }) => {
  const token = await signIn(email, password, clientIp(request));
  return new Response(null, { status: 204, headers: { "set-cookie": sessionCookie(token) } });
});