import type { Invitation } from "../../../contract";
import { createInvitation, listInvitations, NewInvitation } from "../../../server/identity";
import { apiRoute } from "../../../server/shared/api-route";

export const GET = apiRoute("member", async (_request, member) =>
  Response.json((await listInvitations(member)) satisfies Invitation[]),
);

export const POST = apiRoute("member", NewInvitation, async (_request, member, { email }) =>
  Response.json((await createInvitation(member, email)) satisfies Invitation, { status: 201 }),
);