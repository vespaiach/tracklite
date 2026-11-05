import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "../../shared/db";
import type { Uuid } from "../../shared/ids";
import { invitations } from "../tables";
import { assertAdmin, type Member } from "../sessions";
import type { Executor } from "../../shared/transaction";
import { isOpen, notFound, openInvitation, sendLink } from "../invitations";

export async function resendInvitation(actor: Member, id: Uuid | undefined) {
  assertAdmin(actor);

  if (id === undefined) throw notFound();

  await db.transaction(async (tx) => {
    const invitation = await lockedOpenInvitation(tx, id);
    await sendLink(tx, actor, invitation);
  });

  return openInvitation(id);
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