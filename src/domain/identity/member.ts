import { AggregateRoot } from "../shared/aggregate-root";
import { DomainError } from "../shared/domain-error";
import type { Username } from "../shared/identifiers";
import type { FullName } from "./full-name";
import { Role } from "./role";

export type MemberProps = {
  id: string;
  email: string;
  fullName: FullName;
  username: Username;
  role: Role;
  passwordHash: string;
  deactivatedAt: Date | null;
};

type NewMember = Omit<MemberProps, "id" | "deactivatedAt">;

export class Member extends AggregateRoot {
  readonly id: string;
  readonly email: string;
  readonly username: Username;
  fullName: FullName;
  role: Role;
  passwordHash: string;
  deactivatedAt: Date | null;

  private constructor(props: MemberProps) {
    super();
    this.id = props.id;
    this.email = props.email;
    this.username = props.username;
    this.fullName = props.fullName;
    this.role = props.role;
    this.passwordHash = props.passwordHash;
    this.deactivatedAt = props.deactivatedAt;
  }

  static create(member: NewMember) {
    return new Member({ ...member, id: crypto.randomUUID(), deactivatedAt: null });
  }

  static rehydrate(props: MemberProps) {
    return new Member(props);
  }

  rename(fullName: FullName) {
    this.fullName = fullName;
  }

  changePasswordHash(passwordHash: string) {
    this.passwordHash = passwordHash;
  }

  makeAdmin() {
    this.role = Role.admin;
  }

  removeAdmin(activeAdminIds: readonly string[]) {
    this.#keepAnAdmin(activeAdminIds);
    this.role = Role.member;
  }

  deactivate(activeAdminIds: readonly string[]) {
    this.#keepAnAdmin(activeAdminIds);
    this.deactivatedAt ??= new Date();
  }

  reactivate() {
    this.deactivatedAt = null;
  }

  #keepAnAdmin(activeAdminIds: readonly string[]) {
    if (activeAdminIds.length === 1 && activeAdminIds[0] === this.id) {
      throw new DomainError("invalid", "There must be at least one admin.");
    }
  }
}