import { PasswordReset, resetPassword, sessionCookie } from "../../../server/identity";
import { apiRoute } from "../../../server/shared/api-route";

export const POST = apiRoute("public", PasswordReset, async (_request, { token, password }) => {
  const sessionToken = await resetPassword(token, password);
  return new Response(null, { status: 204, headers: { "set-cookie": sessionCookie(sessionToken) } });
});