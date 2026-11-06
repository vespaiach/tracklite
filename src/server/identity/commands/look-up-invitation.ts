import "server-only";
import { db } from "../../../infrastructure/db";
import type { InvitationLookup } from "../../../contract";
import { invitationByToken, usableInvitation } from "../invitations";

export async function lookUpInvitation(token: string): Promise<InvitationLookup> {
  const [invitation] = await invitationByToken(db, token);
  return { email: usableInvitation(invitation).email };
}