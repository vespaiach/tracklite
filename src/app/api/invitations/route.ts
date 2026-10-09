import type { Invitation } from "../../../client/api";
import { apiRoute } from "../../../server/api-route";
import { createInvitation, listInvitations } from "../../../server/invitations";

export const GET = apiRoute("member", async (_request, member) =>
  Response.json((await listInvitations(member)) satisfies Invitation[]),
);

export const POST = apiRoute("member", async (request, member) => {
  const body: { email?: unknown } = await request.json();
  return Response.json((await createInvitation(member, body.email)) satisfies Invitation, { status: 201 });
});