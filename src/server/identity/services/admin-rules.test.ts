import { expect, it } from "vitest";
import { isLastAdmin, mayLeaveNoAdmin } from "./admin-rules";

it("REQ-007.3: only removing an admin role or deactivating can leave the team without an admin", () => {
  expect(mayLeaveNoAdmin({ role: "member" })).toBe(true);
  expect(mayLeaveNoAdmin({ deactivated: true })).toBe(true);
  expect(mayLeaveNoAdmin({ role: "admin" })).toBe(false);
  expect(mayLeaveNoAdmin({ deactivated: false })).toBe(false);
});

it("REQ-007.3, REQ-052.3: the target is the last admin only when they are the one active admin left", () => {
  expect(isLastAdmin(["sam"], "sam")).toBe(true);
  expect(isLastAdmin(["sam", "jo"], "sam")).toBe(false);
  expect(isLastAdmin(["jo"], "sam")).toBe(false);
});