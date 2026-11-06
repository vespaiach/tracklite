import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { Passwords, SetupSecret } from "../../application/identity/ports";
import { readConfig } from "../config";
import { hashPassword, needsRehash, verifyPassword } from "../passwords";
import { hashToken } from "../tokens";
import { type TransactionScope, unitOfWork } from "../unit-of-work";
import { drizzleMemberRepository } from "./drizzle-member-repository";
import { drizzleSessionRepository } from "./drizzle-session-repository";
import { signInLimits } from "./limits";

const unmatchablePasswordHash =
  "$argon2id$v=19$m=19456,t=2,p=1$VqMg3vP4l4k/oTBqNfqeLw$B2ZKVj/Dbk+4+Yz/J9xLGLD2lWpYFgjVjQVzNtpIc8M";

const passwords: Passwords = {
  hash: hashPassword,
  verify: (passwordHash, password) => verifyPassword(passwordHash ?? unmatchablePasswordHash, password),
  needsRehash,
};

const setupSecret: SetupSecret = {
  configured: () => readConfig().setupSecret !== undefined,
  matches: (secret) => timingSafeEqual(hashToken(secret), hashToken(readConfig().setupSecret ?? "")),
};

function identityRepositories(scope: TransactionScope) {
  return {
    members: drizzleMemberRepository(scope),
    sessions: drizzleSessionRepository(scope),
    signInLimits: signInLimits(scope.tx),
    passwords,
    setupSecret,
  };
}

export const identityWork = unitOfWork(identityRepositories);