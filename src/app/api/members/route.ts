import type { Me, MemberSummary } from "../../../contract";
import { listMembers, profileResponse } from "../../../queries";
import {
  acceptInvitation,
  InvitationAcceptance,
  sessionCookie,
  signedInMember,
} from "../../../server/identity";
import { DomainError } from "../../../domain/shared/domain-error";
import { apiRoute } from "../../../server/shared/api-route";

export const GET = apiRoute("member", async (_request, member) =>
  Response.json((await listMembers(member)) satisfies (Me | MemberSummary)[]),
);

export const POST = apiRoute("public", InvitationAcceptance, async (request, acceptance) => {
  const signedIn = await signedInMember(request);
  if (signedIn) {
    throw new DomainError(
      "forbidden",
      `You're signed in as ${signedIn.fullName}. Sign out to accept this invitation.`,
    );
  }

  const { member, sessionToken } = await acceptInvitation(acceptance);
  return Response.json(profileResponse(member) satisfies Me, {
    status: 201,
    headers: { "set-cookie": sessionCookie(sessionToken) },
  });
});