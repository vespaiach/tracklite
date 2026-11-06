"use server";

import { acceptInvitation as joinTeam } from "../../../application/identity/accept-invitation";
import { DomainError } from "../../../domain/shared/domain-error";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { action } from "../../_server/action";
import { InvitationAcceptance } from "../../_server/schemas/identity";
import { pageMember, startSessionCookie } from "../../_server/session";

export const acceptInvitation = action(
  "acceptInvitation",
  "public",
  InvitationAcceptance,
  async (acceptance, nameActor) => {
    await refuseSignedInMember();

    const { username, sessionToken } = await joinTeam(identityWork, acceptance);
    nameActor(username.value);

    await startSessionCookie(sessionToken);
    return null;
  },
);

async function refuseSignedInMember() {
  const signedIn = await pageMember();
  if (signedIn) {
    throw new DomainError(
      "forbidden",
      `You're signed in as ${signedIn.fullName}. Sign out to accept this invitation.`,
    );
  }
}