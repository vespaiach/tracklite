import { signIn } from "../../../application/identity/sign-in";
import { clientIp } from "../../../infrastructure/identity/limits";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { sessionCookie } from "../../../infrastructure/identity/session";
import { SignIn } from "../../../server/identity";
import { apiRoute } from "../../../server/shared/api-route";

export const POST = apiRoute("public", SignIn, async (request, { email, password }, nameActor) => {
  const { token, username } = await signIn(identityWork, { email, password, ip: clientIp(request) });
  nameActor(username);
  return new Response(null, { status: 204, headers: { "set-cookie": sessionCookie(token) } });
});