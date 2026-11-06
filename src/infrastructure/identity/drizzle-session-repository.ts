import "server-only";
import { and, eq, ne } from "drizzle-orm";
import type { SessionRepository } from "../../domain/identity/session-repository";
import { hashToken } from "../tokens";
import type { TransactionScope } from "../unit-of-work";
import { createSession } from "./session";
import { sessions } from "./tables";

export function drizzleSessionRepository({ tx }: TransactionScope): SessionRepository {
  return {
    start: (memberId) => createSession(memberId, tx),

    async end(token) {
      await tx.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    },

    async endAllOf(memberId) {
      await tx.delete(sessions).where(eq(sessions.memberId, memberId));
    },

    async endOthersOf(memberId, keptToken) {
      await tx
        .delete(sessions)
        .where(and(eq(sessions.memberId, memberId), ne(sessions.tokenHash, hashToken(keptToken))));
    },
  };
}