import { apiRoute } from "../../../server/api-route";
import { lookUpInvitation } from "../../../server/invitations";

export const POST = apiRoute("public", async (request) => {
  const body: { token?: unknown } = await request.json();
  return Response.json(await lookUpInvitation(String(body.token ?? "")));
});