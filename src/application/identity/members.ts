import type { Actor } from "../../domain/identity/actor";
import type { MemberRepository } from "../../domain/identity/member-repository";
import { DomainError } from "../../domain/shared/domain-error";

export async function loadActor(members: MemberRepository, actor: Actor) {
  const member = await members.get(actor.id);
  if (!member) throw new DomainError("signedOut", "Sign in to continue.");
  return member;
}