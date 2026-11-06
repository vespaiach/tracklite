import "server-only";
import { sql } from "drizzle-orm";
import { DomainError } from "../../../domain/shared/domain-error";
import { db } from "../../../infrastructure/db";
import { sendEmail } from "../../../infrastructure/email/send";
import { passwordResetEmail } from "../../../infrastructure/email/templates";
import { tooManyAttempts } from "../../../application/identity/limits";
import { recordResetRequest, resetRequestLimitReached } from "../../../infrastructure/identity/limits";
import { activeMemberByEmail } from "../members";
import { passwordResetTokens } from "../../../infrastructure/identity/tables";
import { createToken, hashToken } from "../../../infrastructure/tokens";

export async function requestResetLink(normalizedEmail: string, ip: string) {
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
    const sent = await sendEmail({ to: member.email, ...passwordResetEmail({ email: member.email, token }) });
    if (!sent.ok) throw new DomainError("unavailable", "We couldn’t send the email. Try again.");
  });
}