import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "../../shared/db";
import { invitations } from "../tables";

export async function markInvitationBounced(providerMessageId: string) {
  const [invitation] = await db
    .update(invitations)
    .set({ bouncedAt: sql`now()` })
    .where(eq(invitations.providerMessageId, providerMessageId))
    .returning({ id: invitations.id });
  return invitation;
}