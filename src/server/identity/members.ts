import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { DomainError } from "../../domain/shared/domain-error";
import { db } from "../../infrastructure/db";
import type { Transaction } from "../../infrastructure/transaction";
import { type Member, members } from "../../infrastructure/identity/tables";

export { memberSummary } from "../../domain/identity/member-summary";

export async function activeMemberByEmail(normalizedEmail: string): Promise<Member | undefined> {
  const [member] = await db
    .select()
    .from(members)
    .where(and(eq(sql`lower(${members.email})`, normalizedEmail), isNull(members.deactivatedAt)));
  return member;
}

export async function editConflict(tx: Transaction, editorId: string | null) {
  const [editor] = editorId
    ? await tx.select({ fullName: members.fullName }).from(members).where(eq(members.id, editorId))
    : [];
  return new DomainError(
    "conflict",
    `This was changed by ${editor?.fullName ?? "someone else"}. Copy your text and reload.`,
  );
}