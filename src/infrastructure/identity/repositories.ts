import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { AccountEmails, ClientErrorLog, Passwords, SetupSecret } from "../../application/identity/ports";
import { readConfig } from "../config";
import { sendEmail } from "../email/send";
import { invitationEmail, passwordResetEmail } from "../email/templates";
import { logError } from "../log";
import { hashPassword, needsRehash, verifyPassword } from "../passwords";
import { hashToken } from "../tokens";
import { type TransactionScope, unitOfWork } from "../unit-of-work";
import { drizzleInvitationRepository } from "./drizzle-invitation-repository";
import { drizzleMemberRepository } from "./drizzle-member-repository";
import { drizzlePasswordResetRepository } from "./drizzle-password-reset-repository";
import { drizzleSessionRepository } from "./drizzle-session-repository";
import { clientErrorLimits, resetRequestLimits, signInLimits } from "./limits";

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

const accountEmails: AccountEmails = {
  invitation: (to, inviterName, token) => sendEmail({ to, ...invitationEmail({ inviterName, token }) }),
  passwordReset: (to, token) => sendEmail({ to, ...passwordResetEmail({ email: to, token }) }),
};

const clientErrorLog: ClientErrorLog = {
  write: (event, error, details) => logError("client", event, error, details),
};

function identityRepositories(scope: TransactionScope) {
  return {
    members: drizzleMemberRepository(scope),
    sessions: drizzleSessionRepository(scope),
    invitations: drizzleInvitationRepository(scope),
    passwordResets: drizzlePasswordResetRepository(scope),
    signInLimits: signInLimits(scope.tx),
    resetRequestLimits: resetRequestLimits(scope.tx),
    clientErrorLimits: clientErrorLimits(scope.tx),
    passwords,
    setupSecret,
    accountEmails,
    clientErrorLog,
  };
}

export const identityWork = unitOfWork(identityRepositories);