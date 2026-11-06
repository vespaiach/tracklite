import type { MemberRepository } from "../../domain/identity/member-repository";
import type { SessionRepository } from "../../domain/identity/session-repository";
import { DomainError } from "../../domain/shared/domain-error";
import type { UnitOfWork } from "../shared/unit-of-work";
import { tooManyAttempts } from "./limits";
import type { Passwords, SignInLimits } from "./ports";

type Repositories = {
  members: MemberRepository;
  sessions: SessionRepository;
  signInLimits: SignInLimits;
  passwords: Passwords;
};

type SignInInput = { email: string; password: string; ip: string };

export async function signIn(work: UnitOfWork<Repositories>, { email, password, ip }: SignInInput) {
  const signedIn = await work.run(async ({ members, sessions, signInLimits, passwords }) => {
    if (await signInLimits.reached(email, ip)) throw tooManyAttempts();

    const member = await members.activeByEmail(email);
    const passwordMatches = await passwords.verify(member?.passwordHash, password);
    if (!member || !passwordMatches) {
      await signInLimits.recordFailure(email, ip);
      return undefined;
    }

    if (passwords.needsRehash(member.passwordHash)) {
      member.changePasswordHash(await passwords.hash(password));
      await members.save(member);
    }

    return { token: await sessions.start(member.id), username: member.username.value };
  });

  if (!signedIn) throw new DomainError("invalid", "Incorrect email or password.");
  return signedIn;
}