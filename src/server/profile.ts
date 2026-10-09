import "server-only";
import { and, eq, ne } from "drizzle-orm";
import type { PasswordChange } from "../schemas/account";
import type { ProfileChanges } from "../schemas/profile";
import { ApiError } from "./api-error";
import { db } from "./db";
import { recordFailedSignIn, signInLimitReached, tooManyAttempts } from "./limits";
import { normalizeEmail } from "./members";
import { hashPassword, verifyPassword } from "./passwords";
import { members, sessions } from "./schema";
import type { Member } from "./sessions";
import { hashToken } from "./tokens";

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