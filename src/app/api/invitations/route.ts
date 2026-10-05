import { apiRoute } from "../../../server/api-route";
import { createInvitation, listInvitations } from "../../../server/invitations";

export const GET = apiRoute("admin", async () => Response.json(await listInvitations()));

export const POST = apiRoute("admin", async (request, member) => {
  const body: { email?: unknown } = await request.json();
  return Response.json(await createInvitation(member, body.email), { status: 201 });
});