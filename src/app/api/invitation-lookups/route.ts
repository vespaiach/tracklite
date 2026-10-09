import type { InvitationLookup } from "../../../client/api";
import { InvitationLinkLookup } from "../../../schemas/invitation";
import { apiRoute } from "../../../server/api-route";
import { lookUpInvitation } from "../../../server/invitations";

export const POST = apiRoute("public", InvitationLinkLookup, async (_request, { token }) =>
  Response.json((await lookUpInvitation(token)) satisfies InvitationLookup),
);