import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { ApiError } from "./api-error";
import { db } from "./db";
import { sendEmail } from "./email/send";
import { passwordResetEmail } from "./email/templates";
import { recordResetRequest, resetRequestLimitReached, tooManyAttempts } from "./limits";
import { activeMemberByEmail, normalizeEmail } from "./members";
import { hashPassword, passwordError } from "./passwords";
import { members, passwordResetTokens, sessions } from "./schema";
import { createSession } from "./sessions";
import { createToken, hashToken } from "./tokens";

function expiredLink() {
  return new ApiError(410, "This link has expired");
}

export async function requestResetLink(email: string, ip: string) {
  const normalizedEmail = normalizeEmail(email);
  if (await resetRequestLimitReached(normalizedEmail, ip)) throw tooManyAttempts();
  await recordResetRequest(normalizedEmail, ip);

  const member = await activeMemberByEmail(normalizedEmail);
  if (!member) return;

  const token = createToken();
  await db.transaction(async (tx) => {
    await tx.insert(passwordResetTokens).values({
      memberId: member.id,
      tokenHash: hashToken(token),
      expiresAt: sql`now() + interval '30 minutes'`,
    });
    await sendEmail({ to: member.email, ...passwordResetEmail({ email: member.email, token }) }).catch(() => {
      throw new ApiError(503, "We couldn't send the email. Try again.");
    });
  });
}

function usableLink(executor: Pick<typeof db, "select">, token: string) {
  return executor
    .select({ memberId: passwordResetTokens.memberId })
    .from(passwordResetTokens)
    .innerJoin(members, eq(members.id, passwordResetTokens.memberId))
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, sql`now()`),
        isNull(members.deactivatedAt),
      ),
    );
}

export async function checkResetLink(token: string) {
  const [link] = await usableLink(db, token);
  if (!link) throw expiredLink();
}

export async function resetPassword(token: string, password: string) {
  return db.transaction(async (tx) => {
    const [link] = await usableLink(tx, token).for("update", { of: passwordResetTokens });
    if (!link) throw expiredLink();

    const error = passwordError(password);
    if (error) throw new ApiError(422, "Check the highlighted fields", { password: error });

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