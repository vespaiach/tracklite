import { type Actor, assertAdmin } from "../../domain/identity/actor";
import { invitationNotFound } from "../../domain/identity/invitation";
import type { InvitationRepository } from "../../domain/identity/invitation-repository";
import type { MemberRepository } from "../../domain/identity/member-repository";
import type { Uuid } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";
import { sendInvitationLink } from "./invitation-link";
import { loadActor } from "./members";
import type { AccountEmails } from "./ports";

type Repositories = {
  members: MemberRepository;
  invitations: InvitationRepository;
  accountEmails: AccountEmails;
};

export async function resendInvitation(actor: Actor, work: UnitOfWork<Repositories>, id: Uuid | undefined) {
  assertAdmin(actor);

  if (id === undefined) throw invitationNotFound();

  return work.run(async (repositories) => {
    const invitation = await repositories.invitations.getOpen(id.value);
    if (!invitation) throw invitationNotFound();

    const inviter = await loadActor(repositories.members, actor);
    await sendInvitationLink(repositories, invitation, inviter);

    return invitation.props.id;
  });
}