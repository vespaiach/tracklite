import type { MemberChanges } from "../schemas";

export function mayLeaveNoAdmin({ role, deactivated }: MemberChanges) {
  return role === "member" || deactivated === true;
}

export function isLastAdmin(activeAdminIds: string[], targetId: string) {
  return activeAdminIds.length === 1 && activeAdminIds[0] === targetId;
}