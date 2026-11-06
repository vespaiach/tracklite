import { type Actor, assertAdmin } from "../../domain/identity/actor";
import { invitationNotFound } from "../../domain/identity/invitation";
import type { InvitationRepository } from "../../domain/identity/invitation-repository";
import type { Uuid } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";

export async function revokeInvitation(
  actor: Actor,
  work: UnitOfWork<{ invitations: InvitationRepository }>,
  id: Uuid | undefined,
) {
  assertAdmin(actor);

  if (id === undefined) throw invitationNotFound();

  await work.run(async ({ invitations }) => {
    const invitation = await invitations.getOpen(id.value);
    if (!invitation) throw invitationNotFound();

    invitation.revoke();
    await invitations.save(invitation);
  });
}