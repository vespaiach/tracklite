import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/db";
import type { Uuid } from "../../../infrastructure/ids";
import { invitations } from "../../../infrastructure/identity/tables";
import { assertAdmin, type Member } from "../sessions";
import { isOpen, notFound } from "../invitations";

export async function revokeInvitation(actor: Member, id: Uuid | undefined) {
  assertAdmin(actor);

  if (id === undefined) throw notFound();

  const revoked = await db
    .update(invitations)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(invitations.id, id), isOpen))
    .returning({ id: invitations.id });
  if (revoked.length === 0) throw notFound();
}