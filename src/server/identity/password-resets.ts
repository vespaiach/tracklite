import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { DomainError } from "../../domain/shared/domain-error";
import type { db } from "../../infrastructure/db";
import { members, passwordResetTokens } from "../../infrastructure/identity/tables";
import { hashToken } from "../../infrastructure/tokens";

export function expiredLink() {
  return new DomainError("expired", "This link has expired");
}

export function usableLink(executor: Pick<typeof db, "select">, token: string) {
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