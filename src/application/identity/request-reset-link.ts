import type { MemberRepository } from "../../domain/identity/member-repository";
import type { PasswordResetRepository } from "../../domain/identity/password-reset-repository";
import type { UnitOfWork } from "../shared/unit-of-work";
import { emailUnavailable } from "./invitation-link";
import { tooManyAttempts } from "./limits";
import type { AccountEmails, RequestLimits, ResetRequester } from "./ports";

type Repositories = {
  members: MemberRepository;
  passwordResets: PasswordResetRepository;
  accountEmails: AccountEmails;
  resetRequestLimits: RequestLimits<ResetRequester>;
};

export async function requestResetLink(work: UnitOfWork<Repositories>, requester: ResetRequester) {
  await work.run(async ({ resetRequestLimits }) => {
    if (await resetRequestLimits.reached(requester)) throw tooManyAttempts();
    await resetRequestLimits.record(requester);
  });

  await work.run(async ({ members, passwordResets, accountEmails }) => {
    const member = await members.activeByEmail(requester.email);
    if (!member) return;

    const token = await passwordResets.issue(member.props.id);
    const sent = await accountEmails.passwordReset(member.props.email, token);
    if (!sent.ok) throw emailUnavailable();
  });
}