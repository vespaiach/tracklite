import { signOut } from "../../../../application/identity/sign-out";
import { identityWork } from "../../../../infrastructure/identity/repositories";
import { clearedSessionCookie, readSessionToken } from "../../../../infrastructure/identity/session";
import { apiRoute } from "../../../../server/shared/api-route";

export const DELETE = apiRoute("public", async (request) => {
  const token = readSessionToken(request);
  if (token) await signOut(identityWork, token);
  return new Response(null, { status: 204, headers: { "set-cookie": clearedSessionCookie() } });
});