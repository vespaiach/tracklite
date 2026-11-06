import { type Actor, assertAdmin } from "../../domain/identity/actor";
import type { Member } from "../../domain/identity/member";
import type { MemberRepository } from "../../domain/identity/member-repository";
import type { Role } from "../../domain/identity/role";
import type { SessionRepository } from "../../domain/identity/session-repository";
import { DomainError } from "../../domain/shared/domain-error";
import type { Username } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";

type MemberChanges = { role?: Role; deactivated?: boolean };

export async function updateMember(
  actor: Actor,
  work: UnitOfWork<{ members: MemberRepository; sessions: SessionRepository }>,
  username: Username | undefined,
  changes: MemberChanges,
) {
  assertAdmin(actor);

  return work.run(async ({ members, sessions }) => {
    const activeAdminIds = await members.lockActiveAdminIds();
    const target = username && (await members.getByUsername(username));
    if (!target) throw new DomainError("notFound", "Not found");

    applyChanges(target, changes, activeAdminIds);
    await members.save(target);

    if (changes.deactivated === true) await sessions.endAllOf(target.props.id);
    return target.props.username;
  });
}

function applyChanges(target: Member, { role, deactivated }: MemberChanges, activeAdminIds: string[]) {
  if (role?.value === "admin") target.makeAdmin();
  if (role?.value === "member") target.removeAdmin(activeAdminIds);
  if (deactivated === true) target.deactivate(activeAdminIds);
  if (deactivated === false) target.reactivate();
}