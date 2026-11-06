import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { PasswordReset } from "../../domain/identity/password-reset";
import type { PasswordResetRepository } from "../../domain/identity/password-reset-repository";
import { createToken, hashToken } from "../tokens";
import type { TransactionScope } from "../unit-of-work";
import { members, passwordResetTokens } from "./tables";

export function drizzlePasswordResetRepository({ tx, saved }: TransactionScope): PasswordResetRepository {
  return {
    async issue(memberId) {
      const token = createToken();
      await tx.insert(passwordResetTokens).values({
        memberId,
        tokenHash: hashToken(token),
        expiresAt: sql`now() + interval '30 minutes'`,
      });
      return token;
    },

    async byToken(token) {
      const [row] = await tx
        .select({
          id: passwordResetTokens.id,
          memberId: passwordResetTokens.memberId,
          used: sql<boolean>`${passwordResetTokens.usedAt} is not null`,
          usable: sql<boolean>`${passwordResetTokens.usedAt} is null
            and ${passwordResetTokens.expiresAt} > now()
            and ${members.deactivatedAt} is null`,
        })
        .from(passwordResetTokens)
        .innerJoin(members, eq(members.id, passwordResetTokens.memberId))
        .where(eq(passwordResetTokens.tokenHash, hashToken(token)))
        .for("update", { of: passwordResetTokens });
      return row && PasswordReset.rehydrate(row);
    },

    async save(reset) {
      if (reset.props.used) {
        await tx
          .update(passwordResetTokens)
          .set({ usedAt: sql`now()` })
          .where(
            and(eq(passwordResetTokens.memberId, reset.props.memberId), isNull(passwordResetTokens.usedAt)),
          );
      }
      saved(reset);
    },
  };
}