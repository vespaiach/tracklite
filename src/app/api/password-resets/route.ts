import { resetPassword } from "../../../application/identity/reset-password";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { sessionCookie } from "../../../infrastructure/identity/session";
import { apiRoute } from "../../../server/shared/api-route";
import { PasswordReset } from "../../_server/schemas/identity";

export const POST = apiRoute("public", PasswordReset, async (_request, reset) => {
  const sessionToken = await resetPassword(identityWork, reset);
  return new Response(null, { status: 204, headers: { "set-cookie": sessionCookie(sessionToken) } });
});