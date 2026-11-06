import type { InvitationLookup } from "../../contract";
import { usableInvitation } from "../../domain/identity/invitation";
import type { InvitationRepository } from "../../domain/identity/invitation-repository";
import type { UnitOfWork } from "../shared/unit-of-work";

export async function lookUpInvitation(
  work: UnitOfWork<{ invitations: InvitationRepository }>,
  token: string,
): Promise<InvitationLookup> {
  return work.run(async ({ invitations }) => ({
    email: usableInvitation(await invitations.byToken(token)).props.email,
  }));
}