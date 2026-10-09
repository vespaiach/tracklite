import type { Invitation } from "../../../client/api";
import { NewInvitation } from "../../../schemas/invitation";
import { apiRoute } from "../../../server/api-route";
import { createInvitation, listInvitations } from "../../../server/invitations";

export const GET = apiRoute("member", async (_request, member) =>
  Response.json((await listInvitations(member)) satisfies Invitation[]),
);

export const POST = apiRoute("member", NewInvitation, async (_request, member, { email }) =>
  Response.json((await createInvitation(member, email)) satisfies Invitation, { status: 201 }),
);