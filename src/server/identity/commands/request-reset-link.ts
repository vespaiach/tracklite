import "server-only";
import { sql } from "drizzle-orm";
import { DomainError } from "../../shared/domain-error";
import { db } from "../../shared/db";
import { sendEmail } from "../../shared/email/send";
import { passwordResetEmail } from "../../shared/email/templates";
import { recordResetRequest, resetRequestLimitReached, tooManyAttempts } from "../limits";
import { activeMemberByEmail } from "../members";
import { passwordResetTokens } from "../tables";
import { createToken, hashToken } from "../../shared/tokens";

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