import type { MemberRepository } from "../../domain/identity/member-repository";
import { usableReset } from "../../domain/identity/password-reset";
import type { PasswordResetRepository } from "../../domain/identity/password-reset-repository";
import type { SessionRepository } from "../../domain/identity/session-repository";
import type { UnitOfWork } from "../shared/unit-of-work";
import type { Passwords } from "./ports";

type Repositories = {
  members: MemberRepository;
  sessions: SessionRepository;
  passwordResets: PasswordResetRepository;
  passwords: Passwords;
};

export async function resetPassword(
  work: UnitOfWork<Repositories>,
  { token, password }: { token: string; password: string },
) {
  return work.run(async ({ members, sessions, passwordResets, passwords }) => {
    const reset = usableReset(await passwordResets.byToken(token));
    reset.use();
    await passwordResets.save(reset);

    const member = await members.get(reset.props.memberId);
    if (member) {
      member.changePasswordHash(await passwords.hash(password));
      await members.save(member);
    }

    await sessions.endAllOf(reset.props.memberId);
    return sessions.start(reset.props.memberId);
  });
}