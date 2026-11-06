import { createInvitation } from "../../../application/identity/create-invitation";
import type { Invitation } from "../../../contract";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { listInvitations, openInvitation } from "../../../queries";
import { apiRoute } from "../../../server/shared/api-route";
import { NewInvitation } from "../../_server/schemas/identity";

export const GET = apiRoute("member", async (_request, member) =>
  Response.json((await listInvitations(member)) satisfies Invitation[]),
);

export const POST = apiRoute("member", NewInvitation, async (_request, member, { email }) => {
  const id = await createInvitation(member, identityWork, email);
  return Response.json((await openInvitation(id)) satisfies Invitation, { status: 201 });
});