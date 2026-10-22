import type { InvitationLookup } from "../../../contract";
import { InvitationLinkLookup, lookUpInvitation } from "../../../server/identity";
import { apiRoute } from "../../../server/shared/api-route";

export const POST = apiRoute("public", InvitationLinkLookup, async (_request, { token }) =>
  Response.json((await lookUpInvitation(token)) satisfies InvitationLookup),
);