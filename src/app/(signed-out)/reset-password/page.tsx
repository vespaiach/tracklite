import { checkResetLink } from "../../../application/identity/check-reset-link";
import { DomainError } from "../../../domain/shared/domain-error";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { pageMember } from "../../_server/session";
import { signOut } from "../actions";
import { SignOutPrompt } from "../SignOutPrompt";
import { resetPassword } from "./actions";
import { ResetLinkExpired, ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const member = await pageMember();
  if (member) {
    return (
      <SignOutPrompt
        text={`You're signed in as ${member.fullName}. Sign out to reset a password.`}
        signOut={signOut}
      />
    );
  }

  const { token } = await searchParams;
  const linkToken = typeof token === "string" ? token : "";
  if (!(await usable(linkToken))) return <ResetLinkExpired />;

  return (
    <ResetPasswordForm
      token={linkToken}
      resetPassword={resetPassword}
    />
  );
}

async function usable(token: string) {
  try {
    await checkResetLink(identityWork, token);
    return true;
  } catch (error) {
    if (error instanceof DomainError && error.kind === "expired") return false;
    throw error;
  }
}