import { DomainError } from "../../domain/shared/domain-error";

export function tooManyAttempts() {
  return new DomainError("limited", "Too many attempts. Try again later.");
}