import { DomainError } from "../../shared/domain-error";
import type { Member } from "../sessions";

export type Admin = Member & { role: "admin" };

export function assertAdmin(member: Member): asserts member is Admin {
  if (member.role !== "admin") throw new DomainError("forbidden", "You don't have permission to do that.");
}