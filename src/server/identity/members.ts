import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Me, MemberSummary } from "../../contract";
import { DomainError } from "../shared/domain-error";
import { db } from "../shared/db";
import type { Transaction } from "../shared/transaction";
import { members } from "./tables";
import type { Member } from "./sessions";

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

function firstCharacter(word: string) {
  return [...word][0] ?? "";
}

export function initials(fullName: string) {
  const words = fullName.trim().split(/\s+/);
  const last = words.length > 1 ? firstCharacter(words[words.length - 1]) : "";
  return (firstCharacter(words[0]) + last).toUpperCase();
}

export function memberSummary(
  member: Pick<Member, "username" | "fullName" | "deactivatedAt">,
): MemberSummary {
  return {
    username: member.username,
    fullName: member.fullName,
    initials: initials(member.fullName),
    deactivated: member.deactivatedAt !== null,
  };
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