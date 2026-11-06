import { AggregateRoot } from "../shared/aggregate-root";
import { DomainError } from "../shared/domain-error";
import type { Member } from "./member";

export type InvitationProps = {
  id: string;
  email: string;
  invitedBy: string;
  providerMessageId: string | null;
  accepted: boolean;
  revoked: boolean;
  bounced: boolean;
  expired: boolean;
};

export class Invitation extends AggregateRoot {
  #props: Readonly<InvitationProps>;

  private constructor(props: InvitationProps) {
    super();
    this.#props = props;
  }

  get props() {
    return this.#props;
  }

  static rehydrate(props: InvitationProps) {
    return new Invitation(props);
  }

  assertUsable() {
    if (this.#props.revoked) throw new DomainError("expired", "This invitation is no longer valid.");
    if (this.#props.accepted || this.#props.expired) throw expiredInvitation();
  }

  reissue(inviterId: string) {
    this.#props = { ...this.#props, invitedBy: inviterId, bounced: false, expired: false };
  }

  recordSent(providerMessageId: string) {
    this.#props = { ...this.#props, providerMessageId };
  }

  accept() {
    this.assertUsable();
    this.#props = { ...this.#props, accepted: true };
  }

  revoke() {
    this.#props = { ...this.#props, revoked: true };
  }

  bounce() {
    this.#props = { ...this.#props, bounced: true };
  }
}

function expiredInvitation() {
  return new DomainError("expired", "This invitation has expired. Ask an admin for a new one.");
}

export function usableInvitation(invitation: Invitation | undefined) {
  if (!invitation) throw expiredInvitation();
  invitation.assertUsable();
  return invitation;
}

export function invitationNotFound() {
  return new DomainError("notFound", "Not found");
}

export function assertInvitable(existing: Member | undefined) {
  if (existing?.props.deactivatedAt) {
    throw new DomainError("invalid", "This person is deactivated. Reactivate them instead.");
  }
  if (existing) throw new DomainError("invalid", "Already a member");
}