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
  #props: Readonly<MemberProps>;

  private constructor(props: MemberProps) {
    super();
    this.#props = props;
  }

  get props() {
    return this.#props;
  }

  static create(member: NewMember) {
    return new Member({ ...member, id: crypto.randomUUID(), deactivatedAt: null });
  }

  static rehydrate(props: MemberProps) {
    return new Member(props);
  }

  rename(fullName: FullName) {
    this.#props = { ...this.#props, fullName };
  }

  changePasswordHash(passwordHash: string) {
    this.#props = { ...this.#props, passwordHash };
  }

  makeAdmin() {
    this.#props = { ...this.#props, role: Role.admin };
  }

  removeAdmin(activeAdminIds: readonly string[]) {
    this.#keepAnAdmin(activeAdminIds);
    this.#props = { ...this.#props, role: Role.member };
  }

  deactivate(activeAdminIds: readonly string[]) {
    this.#keepAnAdmin(activeAdminIds);
    if (this.#props.deactivatedAt) return;
    this.#props = { ...this.#props, deactivatedAt: new Date() };
  }

  reactivate() {
    this.#props = { ...this.#props, deactivatedAt: null };
  }

  #keepAnAdmin(activeAdminIds: readonly string[]) {
    if (activeAdminIds.length === 1 && activeAdminIds[0] === this.#props.id) {
      throw new DomainError("invalid", "There must be at least one admin.");
    }
  }
}