import type { Me, MemberSummary } from "../../../contract";
import {
  acceptInvitation,
  InvitationAcceptance,
  listMembers,
  profileResponse,
  sessionCookie,
  signedInMember,
} from "../../../server/identity";
import { ApiError } from "../../../server/shared/api-error";
import { apiRoute } from "../../../server/shared/api-route";

export const GET = apiRoute("member", async (_request, member) =>
  Response.json((await listMembers(member)) satisfies (Me | MemberSummary)[]),
);

export const POST = apiRoute("public", InvitationAcceptance, async (request, acceptance) => {
  const signedIn = await signedInMember(request);
  if (signedIn) {
    throw new ApiError(403, `You're signed in as ${signedIn.fullName}. Sign out to accept this invitation.`);
  }

  const { member, sessionToken } = await acceptInvitation(acceptance);
  return Response.json(profileResponse(member) satisfies Me, {
    status: 201,
    headers: { "set-cookie": sessionCookie(sessionToken) },
  });
});