import type { MemberChanges } from "./schemas";

export function mayLeaveNoAdmin({ role, deactivated }: MemberChanges) {
  return role === "member" || deactivated === true;
}

export function isLastAdmin(activeAdminIds: string[], targetId: string) {
  return activeAdminIds.length === 1 && activeAdminIds[0] === targetId;
}

export function inviteRefusal(existing: { deactivatedAt: Date | null } | undefined) {
  if (existing?.deactivatedAt) return "This person is deactivated. Reactivate them instead.";
  if (existing) return "Already a member";
  return undefined;
}

export function checkInvitationLink<T extends { revoked: boolean; usable: boolean }>(
  invitation: T | undefined,
): { usable: T } | { refusal: string } {
  if (invitation?.revoked) return { refusal: "This invitation is no longer valid." };
  if (!invitation?.usable) return { refusal: "This invitation has expired. Ask an admin for a new one." };
  return { usable: invitation };
}