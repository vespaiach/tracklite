import { SignIn } from "../../../schemas/account";
import { apiRoute } from "../../../server/api-route";
import { clientIp } from "../../../server/limits";
import { sessionCookie } from "../../../server/sessions";
import { signIn } from "../../../server/sign-in";

export const POST = apiRoute("public", SignIn, async (request, { email, password }) => {
  const token = await signIn(email, password, clientIp(request));
  return new Response(null, { status: 204, headers: { "set-cookie": sessionCookie(token) } });
});