import "server-only";
import { and, eq, ne } from "drizzle-orm";
import type { PasswordChange } from "../schemas";
import { DomainError } from "../../../domain/shared/domain-error";
import { db } from "../../../infrastructure/db";
import { recordFailedSignIn, signInLimitReached, tooManyAttempts } from "../limits";
import { normalizeEmail } from "../members";
import { hashPassword, verifyPassword } from "../../../infrastructure/passwords";
import { members, sessions } from "../../../infrastructure/identity/tables";
import type { Member } from "../sessions";
import { hashToken } from "../../../infrastructure/tokens";

export async function changePassword(
  actor: Member,
  sessionToken: string,
  { currentPassword, newPassword }: PasswordChange,
  ip: string,
) {
  const email = normalizeEmail(actor.email);
  if (await signInLimitReached(email, ip)) throw tooManyAttempts();

  if (!(await verifyPassword(actor.passwordHash, currentPassword))) {
    await recordFailedSignIn(email, ip);
    throw new DomainError("invalid", "Check the highlighted fields", {
      currentPassword: "Incorrect password",
    });
  }

  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.update(members).set({ passwordHash }).where(eq(members.id, actor.id));
    await tx
      .delete(sessions)
      .where(and(eq(sessions.memberId, actor.id), ne(sessions.tokenHash, hashToken(sessionToken))));
  });
}