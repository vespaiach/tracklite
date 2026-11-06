import { lookUpInvitation } from "../../../application/identity/look-up-invitation";
import { DomainError } from "../../../domain/shared/domain-error";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { pageMember } from "../../_server/session";
import { signOut } from "../actions";
import { SignOutPrompt } from "../SignOutPrompt";
import { acceptInvitation } from "./actions";
import { AcceptInvitationForm, InvitationEnded } from "./AcceptInvitationForm";

export default async function InvitePage({ searchParams }: PageProps<"/invite">) {
  const member = await pageMember();
  if (member) {
    return (
      <SignOutPrompt
        text={`You're signed in as ${member.fullName}. Sign out to accept this invitation.`}
        signOut={signOut}
      />
    );
  }

  const { token } = await searchParams;
  const linkToken = typeof token === "string" ? token : "";
  const invitation = await lookUp(linkToken);
  if ("ended" in invitation) return <InvitationEnded message={invitation.ended} />;

  return (
    <AcceptInvitationForm
      token={linkToken}
      email={invitation.email}
      acceptInvitation={acceptInvitation}
    />
  );
}

async function lookUp(token: string) {
  try {
    return await lookUpInvitation(identityWork, token);
  } catch (error) {
    if (error instanceof DomainError && error.kind === "expired") return { ended: error.message };
    throw error;
  }
}