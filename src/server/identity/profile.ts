import "server-only";
import { and, eq, ne } from "drizzle-orm";
import type { PasswordChange } from "./schemas";
import type { ProfileChanges } from "./schemas";
import { ApiError } from "../shared/api-error";
import { db } from "../shared/db";
import { recordFailedSignIn, signInLimitReached, tooManyAttempts } from "../shared/limits";
import { normalizeEmail } from "./members";
import { hashPassword, verifyPassword } from "../shared/passwords";
import { members, sessions } from "../shared/schema";
import type { Member } from "./sessions";
import { hashToken } from "../shared/tokens";

export async function updateProfile(actor: Member, { fullName }: ProfileChanges) {
  const [updated] = await db.update(members).set({ fullName }).where(eq(members.id, actor.id)).returning();
  return updated;
}

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
    throw new ApiError(422, "Check the highlighted fields", { currentPassword: "Incorrect password" });
  }

  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.update(members).set({ passwordHash }).where(eq(members.id, actor.id));
    await tx
      .delete(sessions)
      .where(and(eq(sessions.memberId, actor.id), ne(sessions.tokenHash, hashToken(sessionToken))));
  });
}