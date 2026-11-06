import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Me } from "../../contract";
import { memberSummary } from "../../domain/identity/member-summary";
import { DomainError } from "../../domain/shared/domain-error";
import { db } from "../../infrastructure/db";
import type { Transaction } from "../../infrastructure/transaction";
import { members } from "../../infrastructure/identity/tables";
import type { Member } from "./sessions";

export { initials, memberSummary } from "../../domain/identity/member-summary";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function activeMemberByEmail(normalizedEmail: string): Promise<Member | undefined> {
  const [member] = await db
    .select()
    .from(members)
    .where(and(eq(sql`lower(${members.email})`, normalizedEmail), isNull(members.deactivatedAt)));
  return member;
}

export function profileResponse(member: Member): Me {
  return {
    ...memberSummary(member),
    email: member.email,
    role: member.role,
  };
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