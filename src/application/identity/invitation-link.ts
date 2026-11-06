import type { Invitation } from "../../domain/identity/invitation";
import type { InvitationRepository } from "../../domain/identity/invitation-repository";
import type { Member } from "../../domain/identity/member";
import { DomainError } from "../../domain/shared/domain-error";
import type { AccountEmails } from "./ports";

export function emailUnavailable() {
  return new DomainError("unavailable", "We couldn’t send the email. Try again.");
}

export async function sendInvitationLink(
  { invitations, accountEmails }: { invitations: InvitationRepository; accountEmails: AccountEmails },
  invitation: Invitation,
  inviter: Member,
) {
  invitation.reissue(inviter.props.id);
  const token = await invitations.issueLink(invitation);

  const sent = await accountEmails.invitation(invitation.props.email, inviter.props.fullName.value, token);
  if (!sent.ok) throw emailUnavailable();

  invitation.recordSent(sent.value.providerMessageId);
  await invitations.save(invitation);
}