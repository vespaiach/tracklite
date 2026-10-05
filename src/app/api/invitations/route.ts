import type { Invitation } from "../../../client/api";
import { apiRoute } from "../../../server/api-route";
import { createInvitation, listInvitations } from "../../../server/invitations";

export const GET = apiRoute("admin", async () =>
  Response.json((await listInvitations()) satisfies Invitation[]),
);

export const POST = apiRoute("admin", async (request, member) => {
  const body: { email?: unknown } = await request.json();
  return Response.json((await createInvitation(member, body.email)) satisfies Invitation, { status: 201 });
});