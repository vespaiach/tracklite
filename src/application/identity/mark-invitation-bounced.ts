import type { InvitationRepository } from "../../domain/identity/invitation-repository";
import type { UnitOfWork } from "../shared/unit-of-work";

export async function markInvitationBounced(
  work: UnitOfWork<{ invitations: InvitationRepository }>,
  providerMessageId: string,
) {
  return work.run(async ({ invitations }) => {
    const invitation = await invitations.bySentMessage(providerMessageId);
    if (!invitation) return undefined;

    invitation.bounce();
    await invitations.save(invitation);
    return invitation.props.id;
  });
}