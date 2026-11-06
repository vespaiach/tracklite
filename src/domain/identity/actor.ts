import type { Role } from "../../contract";
import { DomainError } from "../shared/domain-error";

export type Actor = { id: string; role: Role };

export function assertAdmin<T extends { role: string }>(actor: T): asserts actor is T & { role: "admin" } {
  if (actor.role !== "admin") throw new DomainError("forbidden", "You don't have permission to do that.");
}