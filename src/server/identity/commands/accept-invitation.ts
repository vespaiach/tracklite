import "server-only";
import { eq, sql } from "drizzle-orm";
import { DomainError } from "../../../domain/shared/domain-error";
import { db } from "../../../infrastructure/db";
import type { InvitationAcceptance } from "../schemas";
import { hashPassword } from "../../../infrastructure/passwords";
import { invitations, members } from "../../../infrastructure/identity/tables";
import { createSession } from "../sessions";
import { invitationByToken, usableInvitation } from "../invitations";
import type { Username } from "../../../domain/shared/identifiers";

export async function acceptInvitation({ token, fullName, username, password }: InvitationAcceptance) {
  return db.transaction(async (tx) => {
    const [found] = await invitationByToken(tx, token).for("update");
    const invitation = usableInvitation(found);

    await assertUsernameFree(tx, username);

    const [member] = await tx
      .insert(members)
      .values({
        email: invitation.email,
        fullName,
        username: username.value,
        passwordHash: await hashPassword(password),
        role: "member",
      })
      .returning();

    await tx.update(invitations).set({ acceptedAt: sql`now()` }).where(eq(invitations.id, invitation.id));

    return { member, sessionToken: await createSession(member.id, tx) };
  });
}

async function assertUsernameFree(executor: Pick<typeof db, "select">, username: Username) {
  const [taken] = await executor
    .select({ id: members.id })
    .from(members)
    .where(eq(members.username, username.value));
  if (taken) throw new DomainError("invalid", "Check the highlighted fields", { username: "Username taken" });
}