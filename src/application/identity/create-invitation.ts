import { type Actor, assertAdmin } from "../../domain/identity/actor";
import { assertInvitable } from "../../domain/identity/invitation";
import type { InvitationRepository } from "../../domain/identity/invitation-repository";
import type { MemberRepository } from "../../domain/identity/member-repository";
import type { UnitOfWork } from "../shared/unit-of-work";
import { sendInvitationLink } from "./invitation-link";
import { loadActor } from "./members";
import type { AccountEmails } from "./ports";

type Repositories = {
  members: MemberRepository;
  invitations: InvitationRepository;
  accountEmails: AccountEmails;
};

export async function createInvitation(actor: Actor, work: UnitOfWork<Repositories>, email: string) {
  assertAdmin(actor);

  return work.run(async (repositories) => {
    assertInvitable(await repositories.members.byEmail(email));

    const inviter = await loadActor(repositories.members, actor);
    const invitation = await repositories.invitations.openFor(email, inviter.props.id);
    await sendInvitationLink(repositories, invitation, inviter);

    return invitation.props.id;
  });
}