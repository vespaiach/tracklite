import "server-only";
import { db } from "../../shared/db";
import { invitations } from "../tables";
import type { Member } from "../sessions";
import { assertAdmin } from "../services/authorization";
import { invitationResponse, isOpen, openInvitations } from "../invitations";

export async function listInvitations(actor: Member) {
  assertAdmin(actor);
  const rows = await openInvitations(db).where(isOpen).orderBy(invitations.createdAt);
  return rows.map(invitationResponse);
}