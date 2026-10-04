import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ApiError } from "./api-error";
import { db } from "./db";
import { recordFailedSignIn, signInLimitReached } from "./limits";
import { verifyPassword } from "./passwords";
import { members } from "./schema";
import { createSession } from "./sessions";

const unmatchablePasswordHash =
  "$argon2id$v=19$m=19456,t=2,p=1$VqMg3vP4l4k/oTBqNfqeLw$B2ZKVj/Dbk+4+Yz/J9xLGLD2lWpYFgjVjQVzNtpIc8M";

export async function signIn(email: string, password: string, ip: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (await signInLimitReached(normalizedEmail, ip)) {
    throw new ApiError(429, "Too many attempts. Try again later.");
  }

  const [member] = await db
    .select({ id: members.id, passwordHash: members.passwordHash })
    .from(members)
    .where(and(eq(sql`lower(${members.email})`, normalizedEmail), isNull(members.deactivatedAt)));
  const passwordMatches = await verifyPassword(member?.passwordHash ?? unmatchablePasswordHash, password);
  if (!member || !passwordMatches) {
    await recordFailedSignIn(normalizedEmail, ip);
    throw new ApiError(422, "Incorrect email or password.");
  }

  return createSession(member.id);
}