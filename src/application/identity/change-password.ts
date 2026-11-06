import type { Actor } from "../../domain/identity/actor";
import type { MemberRepository } from "../../domain/identity/member-repository";
import type { SessionRepository } from "../../domain/identity/session-repository";
import { DomainError } from "../../domain/shared/domain-error";
import type { UnitOfWork } from "../shared/unit-of-work";
import { tooManyAttempts } from "./limits";
import { loadActor } from "./members";
import type { Passwords, SignInLimits } from "./ports";

type Repositories = {
  members: MemberRepository;
  sessions: SessionRepository;
  signInLimits: SignInLimits;
  passwords: Passwords;
};

type PasswordChangeInput = { currentPassword: string; newPassword: string; sessionToken: string; ip: string };

export async function changePassword(
  actor: Actor,
  work: UnitOfWork<Repositories>,
  { currentPassword, newPassword, sessionToken, ip }: PasswordChangeInput,
) {
  const changed = await work.run(async ({ members, sessions, signInLimits, passwords }) => {
    const member = await loadActor(members, actor);
    const email = member.props.email.trim().toLowerCase();
    if (await signInLimits.reached(email, ip)) throw tooManyAttempts();

    if (!(await passwords.verify(member.props.passwordHash, currentPassword))) {
      await signInLimits.recordFailure(email, ip);
      return false;
    }

    member.changePasswordHash(await passwords.hash(newPassword));
    await members.save(member);
    await sessions.endOthersOf(member.props.id, sessionToken);
    return true;
  });

  if (!changed) {
    throw new DomainError("invalid", "Check the highlighted fields", {
      currentPassword: "Incorrect password",
    });
  }
}