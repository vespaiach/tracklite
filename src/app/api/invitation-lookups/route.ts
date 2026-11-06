import { lookUpInvitation } from "../../../application/identity/look-up-invitation";
import type { InvitationLookup } from "../../../contract";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { apiRoute } from "../../../server/shared/api-route";
import { InvitationLinkLookup } from "../../_server/schemas/identity";

export const POST = apiRoute("public", InvitationLinkLookup, async (_request, { token }) =>
  Response.json((await lookUpInvitation(identityWork, token)) satisfies InvitationLookup),
);