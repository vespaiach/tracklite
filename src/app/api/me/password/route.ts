import { apiRoute } from "../../../../server/api-route";
import { clientIp } from "../../../../server/limits";
import { changePassword } from "../../../../server/profile";
import { readSessionToken } from "../../../../server/sessions";

export const PUT = apiRoute("member", async (request, member) => {
  const body: { currentPassword?: unknown; newPassword?: unknown } = await request.json();
  await changePassword(
    member,
    readSessionToken(request) ?? "",
    String(body.currentPassword ?? ""),
    String(body.newPassword ?? ""),
    clientIp(request),
  );
  return new Response(null, { status: 204 });
});