import { DomainError } from "../shared/domain-error";
import type { RoleName } from "./role";

export type Actor = { id: string; role: RoleName };

export function assertAdmin<T extends { role: string }>(actor: T): asserts actor is T & { role: "admin" } {
  if (actor.role !== "admin") throw new DomainError("forbidden", "You don't have permission to do that.");
}