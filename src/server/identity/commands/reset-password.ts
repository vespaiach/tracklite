import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/db";
import { hashPassword } from "../../../infrastructure/passwords";
import { members, passwordResetTokens, sessions } from "../../../infrastructure/identity/tables";
import { createSession } from "../sessions";
import { expiredLink, usableLink } from "../password-resets";

export async function resetPassword(token: string, password: string) {
  return db.transaction(async (tx) => {
    const [link] = await usableLink(tx, token).for("update", { of: passwordResetTokens });
    if (!link) throw expiredLink();

    await tx
      .update(members)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(members.id, link.memberId));

    await tx
      .update(passwordResetTokens)
      .set({ usedAt: sql`now()` })
      .where(and(eq(passwordResetTokens.memberId, link.memberId), isNull(passwordResetTokens.usedAt)));

    await tx.delete(sessions).where(eq(sessions.memberId, link.memberId));

    return createSession(link.memberId, tx);
  });
}