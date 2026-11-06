import type { Actor } from "../../domain/identity/actor";
import type { FullName } from "../../domain/identity/full-name";
import type { MemberRepository } from "../../domain/identity/member-repository";
import type { UnitOfWork } from "../shared/unit-of-work";
import { loadActor } from "./members";

export async function updateProfile(
  actor: Actor,
  work: UnitOfWork<{ members: MemberRepository }>,
  { fullName }: { fullName: FullName },
) {
  await work.run(async ({ members }) => {
    const member = await loadActor(members, actor);

    member.rename(fullName);
    await members.save(member);
  });
}