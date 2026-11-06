import type { FullName } from "../../domain/identity/full-name";
import { usableInvitation } from "../../domain/identity/invitation";
import type { InvitationRepository } from "../../domain/identity/invitation-repository";
import { Member } from "../../domain/identity/member";
import type { MemberRepository } from "../../domain/identity/member-repository";
import { Role } from "../../domain/identity/role";
import type { SessionRepository } from "../../domain/identity/session-repository";
import { DomainError } from "../../domain/shared/domain-error";
import type { Username } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";
import type { Passwords } from "./ports";

type Repositories = {
  invitations: InvitationRepository;
  members: MemberRepository;
  sessions: SessionRepository;
  passwords: Passwords;
};

type Acceptance = { token: string; fullName: FullName; username: Username; password: string };

export async function acceptInvitation(
  work: UnitOfWork<Repositories>,
  { token, fullName, username, password }: Acceptance,
) {
  return work.run(async ({ invitations, members, sessions, passwords }) => {
    const invitation = usableInvitation(await invitations.byToken(token));
    invitation.accept();

    if (await members.getByUsername(username)) {
      throw new DomainError("invalid", "Check the highlighted fields", { username: "Username taken" });
    }

    const passwordHash = await passwords.hash(password);
    const member = Member.create({
      email: invitation.props.email,
      fullName,
      username,
      role: Role.member,
      passwordHash,
    });
    await members.save(member);
    await invitations.save(invitation);

    return { username: member.props.username, sessionToken: await sessions.start(member.props.id) };
  });
}