import { expect, it } from "vitest";
import { checkInvitationLink, inviteRefusal, isLastAdmin, mayLeaveNoAdmin } from "./rules";

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

it("REQ-001.2, REQ-001.5, REQ-001.6: inviting a member's or a deactivated person's email is refused; a new email isn't", () => {
  expect(inviteRefusal({ deactivatedAt: null })).toBe("Already a member");
  expect(inviteRefusal({ deactivatedAt: new Date() })).toBe(
    "This person is deactivated. Reactivate them instead.",
  );
  expect(inviteRefusal(undefined)).toBeUndefined();
});

it("REQ-002.2, REQ-002.4: a revoked, expired, used or unknown invitation link is refused; an open one is usable", () => {
  const open = { revoked: false, usable: true };

  expect(checkInvitationLink({ revoked: true, usable: true })).toEqual({
    refusal: "This invitation is no longer valid.",
  });
  expect(checkInvitationLink({ revoked: false, usable: false })).toEqual({
    refusal: "This invitation has expired. Ask an admin for a new one.",
  });
  expect(checkInvitationLink(undefined)).toEqual({
    refusal: "This invitation has expired. Ask an admin for a new one.",
  });
  expect(checkInvitationLink(open)).toEqual({ usable: open });
});