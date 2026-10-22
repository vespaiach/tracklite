import "server-only";
import { eq } from "drizzle-orm";
import { ApiError } from "./shared/api-error";
import { db } from "./shared/db";
import { recordFailedSignIn, signInLimitReached, tooManyAttempts } from "./shared/limits";
import { activeMemberByEmail } from "./members";
import { hashPassword, needsRehash, verifyPassword } from "./shared/passwords";
import { members } from "./shared/schema";
import { createSession } from "./sessions";

const unmatchablePasswordHash =
  "$argon2id$v=19$m=19456,t=2,p=1$VqMg3vP4l4k/oTBqNfqeLw$B2ZKVj/Dbk+4+Yz/J9xLGLD2lWpYFgjVjQVzNtpIc8M";

export async function signIn(normalizedEmail: string, password: string, ip: string) {
  if (await signInLimitReached(normalizedEmail, ip)) throw tooManyAttempts();

  const member = await activeMemberByEmail(normalizedEmail);
  const passwordMatches = await verifyPassword(member?.passwordHash ?? unmatchablePasswordHash, password);
  if (!member || !passwordMatches) {
    await recordFailedSignIn(normalizedEmail, ip);
    throw new ApiError(422, "Incorrect email or password.");
  }

  const newPasswordHash = needsRehash(member.passwordHash) ? await hashPassword(password) : undefined;

  return db.transaction(async (tx) => {
    if (newPasswordHash) {
      await tx.update(members).set({ passwordHash: newPasswordHash }).where(eq(members.id, member.id));
    }
    return createSession(member.id, tx);
  });
}