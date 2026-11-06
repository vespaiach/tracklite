import { acceptInvitation } from "../../../application/identity/accept-invitation";
import type { Me, MemberSummary } from "../../../contract";
import { DomainError } from "../../../domain/shared/domain-error";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { sessionCookie, signedInMember } from "../../../infrastructure/identity/session";
import { listMembers, memberProfile } from "../../../queries";
import { apiRoute } from "../../../server/shared/api-route";
import { InvitationAcceptance } from "../../_server/schemas/identity";

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

  const { username, sessionToken } = await acceptInvitation(identityWork, acceptance);
  return Response.json((await memberProfile(username)) satisfies Me, {
    status: 201,
    headers: { "set-cookie": sessionCookie(sessionToken) },
  });
});