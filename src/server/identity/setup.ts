import "server-only";
import { DomainError } from "../../domain/shared/domain-error";

export function setupDone() {
  return new DomainError("expired", "Setup already done");
}