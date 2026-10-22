import { apiRoute } from "../../../../server/shared/api-route";
import { clearedSessionCookie, endSession, readSessionToken } from "../../../../server/identity";

export const DELETE = apiRoute("public", async (request) => {
  const token = readSessionToken(request);
  if (token) await endSession(token);
  return new Response(null, { status: 204, headers: { "set-cookie": clearedSessionCookie() } });
});