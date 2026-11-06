import { AggregateRoot } from "../shared/aggregate-root";
import { DomainError } from "../shared/domain-error";

export type PasswordResetProps = { id: string; memberId: string; usable: boolean; used: boolean };

export class PasswordReset extends AggregateRoot {
  #props: Readonly<PasswordResetProps>;

  private constructor(props: PasswordResetProps) {
    super();
    this.#props = props;
  }

  get props() {
    return this.#props;
  }

  static rehydrate(props: PasswordResetProps) {
    return new PasswordReset(props);
  }

  use() {
    usableReset(this);
    this.#props = { ...this.#props, usable: false, used: true };
  }
}

export function usableReset(reset: PasswordReset | undefined) {
  if (!reset?.props.usable) throw new DomainError("expired", "This link has expired");
  return reset;
}