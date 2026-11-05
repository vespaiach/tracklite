import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { DomainError } from "../shared/domain-error";
import type { db } from "../shared/db";
import { members, passwordResetTokens } from "./tables";
import { hashToken } from "../shared/tokens";

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