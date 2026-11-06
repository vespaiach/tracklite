import "server-only";
import { db } from "../../../infrastructure/db";
import { invitations } from "../../../infrastructure/identity/tables";
import { assertAdmin, type Member } from "../sessions";
import { invitationResponse, isOpen, openInvitations } from "../invitations";

export async function listInvitations(actor: Member) {
  assertAdmin(actor);
  const rows = await openInvitations(db).where(isOpen).orderBy(invitations.createdAt);
  return rows.map(invitationResponse);
}