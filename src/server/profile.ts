import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { ApiError } from "./api-error";
import { db } from "./db";
import { recordFailedSignIn, signInLimitReached, tooManyAttempts } from "./limits";
import { fullNameError, normalizeEmail } from "./members";
import { hashPassword, passwordError, verifyPassword } from "./passwords";
import { members, sessions } from "./schema";
import type { Member } from "./sessions";
import { hashToken } from "./tokens";

const fixedFields = ["username", "email"];

function invalidFields(fields: Record<string, string>) {
  return new ApiError(422, "Check the highlighted fields", fields);
}

export async function updateProfile(actor: Member, changes: Record<string, unknown>) {
  const fixed = fixedFields.filter((field) => field in changes);
  if (fixed.length > 0) {
    throw invalidFields(Object.fromEntries(fixed.map((field) => [field, "Can't be changed"])));
  }

  const fullName = String(changes.fullName ?? "").trim();
  const error = fullNameError(fullName);
  if (error) throw invalidFields({ fullName: error });

  const [updated] = await db.update(members).set({ fullName }).where(eq(members.id, actor.id)).returning();
  return updated;
}

export async function changePassword(
  actor: Member,
  sessionToken: string,
  currentPassword: string,
  newPassword: string,
  ip: string,
) {
  const email = normalizeEmail(actor.email);
  if (await signInLimitReached(email, ip)) throw tooManyAttempts();

  if (!(await verifyPassword(actor.passwordHash, currentPassword))) {
    await recordFailedSignIn(email, ip);
    throw invalidFields({ currentPassword: "Incorrect password" });
  }

  const error = passwordError(newPassword);
  if (error) throw invalidFields({ newPassword: error });

  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.update(members).set({ passwordHash }).where(eq(members.id, actor.id));
    await tx
      .delete(sessions)
      .where(and(eq(sessions.memberId, actor.id), ne(sessions.tokenHash, hashToken(sessionToken))));
  });
}