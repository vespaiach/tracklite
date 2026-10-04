import "server-only";
import { ApiError } from "./api-error";
import { recordFailedSignIn, signInLimitReached, tooManyAttempts } from "./limits";
import { activeMemberByEmail, normalizeEmail } from "./members";
import { verifyPassword } from "./passwords";
import { createSession } from "./sessions";

const unmatchablePasswordHash =
  "$argon2id$v=19$m=19456,t=2,p=1$VqMg3vP4l4k/oTBqNfqeLw$B2ZKVj/Dbk+4+Yz/J9xLGLD2lWpYFgjVjQVzNtpIc8M";

export async function signIn(email: string, password: string, ip: string) {
  const normalizedEmail = normalizeEmail(email);
  if (await signInLimitReached(normalizedEmail, ip)) throw tooManyAttempts();

  const member = await activeMemberByEmail(normalizedEmail);
  const passwordMatches = await verifyPassword(member?.passwordHash ?? unmatchablePasswordHash, password);
  if (!member || !passwordMatches) {
    await recordFailedSignIn(normalizedEmail, ip);
    throw new ApiError(422, "Incorrect email or password.");
  }

  return createSession(member.id);
}