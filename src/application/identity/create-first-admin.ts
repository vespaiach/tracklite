import type { FullName } from "../../domain/identity/full-name";
import { Member } from "../../domain/identity/member";
import type { MemberRepository } from "../../domain/identity/member-repository";
import { Role } from "../../domain/identity/role";
import type { SessionRepository } from "../../domain/identity/session-repository";
import type { Username } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";
import { checkSetupSecret, setupDone } from "./check-setup-secret";
import type { Passwords, SetupSecret } from "./ports";

type Repositories = {
  members: MemberRepository;
  sessions: SessionRepository;
  passwords: Passwords;
  setupSecret: SetupSecret;
};

type FirstAdmin = { secret: string; email: string; fullName: FullName; username: Username; password: string };

export async function createFirstAdmin(
  work: UnitOfWork<Repositories>,
  { secret, email, fullName, username, password }: FirstAdmin,
) {
  await checkSetupSecret(work, secret);

  return work.run(async ({ members, sessions, passwords }) => {
    const passwordHash = await passwords.hash(password);
    await members.lockAgainstNewMembers();
    if ((await members.count()) > 0) throw setupDone();

    const admin = Member.create({ email, fullName, username, role: Role.admin, passwordHash });
    await members.save(admin);

    return { username: admin.props.username, sessionToken: await sessions.start(admin.props.id) };
  });
}