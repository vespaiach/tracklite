import { PasswordReset } from "../../../schemas/account";
import { apiRoute } from "../../../server/api-route";
import { resetPassword } from "../../../server/password-resets";
import { sessionCookie } from "../../../server/sessions";

export const POST = apiRoute("public", PasswordReset, async (_request, { token, password }) => {
  const sessionToken = await resetPassword(token, password);
  return new Response(null, { status: 204, headers: { "set-cookie": sessionCookie(sessionToken) } });
});