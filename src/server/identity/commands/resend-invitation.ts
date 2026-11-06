import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "../../../infrastructure/db";
import { invitations } from "../../../infrastructure/identity/tables";
import { assertAdmin, type Member } from "../sessions";
import type { Executor } from "../../../infrastructure/transaction";
import { isOpen, notFound, openInvitation, sendLink } from "../invitations";
import type { Uuid } from "../../../domain/shared/identifiers";

export async function resendInvitation(actor: Member, id: Uuid | undefined) {
  assertAdmin(actor);

  if (id === undefined) throw notFound();

  await db.transaction(async (tx) => {
    const invitation = await lockedOpenInvitation(tx, id.value);
    await sendLink(tx, actor, invitation);
  });

  return openInvitation(id.value);
}

async function lockedOpenInvitation(executor: Executor, id: string) {
  const [invitation] = await executor
    .select({ id: invitations.id, email: invitations.email })
    .from(invitations)
    .where(and(eq(invitations.id, id), isOpen))
    .for("update");
  if (!invitation) throw notFound();
  return invitation;
}