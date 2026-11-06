import { FullName } from "../../domain/identity/full-name";
import { Member, type MemberProps } from "../../domain/identity/member";
import { Role } from "../../domain/identity/role";
import { Username } from "../../domain/shared/identifiers";
import type { members } from "./tables";

type MemberRow = typeof members.$inferSelect;

export function toMember(row: MemberRow) {
  return Member.rehydrate({
    id: row.id,
    email: row.email,
    fullName: FullName.rehydrate(row.fullName),
    username: Username.from(row.username),
    role: Role.from(row.role),
    passwordHash: row.passwordHash,
    deactivatedAt: row.deactivatedAt,
  });
}

export function toRow({ fullName, username, role, ...fields }: MemberProps) {
  return { ...fields, fullName: fullName.value, username: username.value, role: role.value };
}