import { expect, it } from "vitest";
import {
  checkInvitationLink,
  describeUserAgent,
  inviteRefusal,
  isLastAdmin,
  maskIp,
  mayLeaveNoAdmin,
} from "./rules";

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

it("SEC-007.7: an IPv4 address keeps 3 octets, a v4-mapped one is masked as IPv4, an IPv6 one keeps 3 groups", () => {
  expect(maskIp("203.0.113.57")).toBe("203.0.113.0");
  expect(maskIp("::ffff:203.0.113.57")).toBe("203.0.113.0");
  expect(maskIp("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8:85a3::");
  expect(maskIp("2001:db8::1")).toBe("2001:db8:0::");
});

it("OPS-008.3: a browser identification is named by browser and device and cut to 300 characters", () => {
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const ipad =
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const androidTablet =
    "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
  const edge = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0${"x".repeat(1000)}`;

  expect(describeUserAgent(iphone)).toEqual({ browser: "Safari", device: "mobile", userAgent: iphone });
  expect(describeUserAgent(ipad)).toMatchObject({ browser: "Safari", device: "tablet" });
  expect(describeUserAgent(androidTablet)).toMatchObject({ browser: "Chrome", device: "tablet" });
  expect(describeUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0")).toMatchObject(
    { browser: "Firefox", device: "desktop" },
  );
  expect(describeUserAgent("")).toEqual({ browser: "Other", device: "desktop", userAgent: "" });

  const described = describeUserAgent(edge);
  expect(described).toMatchObject({ browser: "Edge", device: "desktop" });
  expect(described.userAgent).toBe(edge.slice(0, 300));
});