import "server-only";
import { eq, sql } from "drizzle-orm";
import { DomainError } from "../../shared/domain-error";
import { db } from "../../shared/db";
import type { InvitationAcceptance, Username } from "../schemas";
import { hashPassword } from "../../shared/passwords";
import { invitations, members } from "../tables";
import { createSession } from "../sessions";
import { invitationByToken, usableInvitation } from "../invitations";

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
        username,
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
    .where(eq(members.username, username));
  if (taken) throw new DomainError("invalid", "Check the highlighted fields", { username: "Username taken" });
}