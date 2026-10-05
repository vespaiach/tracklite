import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { members } from "./schema";
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

const maxFullNameLength = 60;

export function fullNameError(trimmedFullName: string) {
  if (trimmedFullName === "") return "Name required";
  if ([...trimmedFullName].length > maxFullNameLength) return `Too long (max ${maxFullNameLength})`;
  return undefined;
}

export function usernameError(username: string) {
  return /^[a-z0-9-]{2,20}$/.test(username) ? undefined : "Use 2 to 20 letters, digits or hyphens";
}

function firstCharacter(word: string) {
  return [...word][0] ?? "";
}

export function initials(fullName: string) {
  const words = fullName.trim().split(/\s+/);
  const last = words.length > 1 ? firstCharacter(words[words.length - 1]) : "";
  return (firstCharacter(words[0]) + last).toUpperCase();
}

export function memberSummary(member: Pick<Member, "username" | "fullName" | "deactivatedAt">) {
  return {
    username: member.username,
    fullName: member.fullName,
    initials: initials(member.fullName),
    deactivated: member.deactivatedAt !== null,
  };
}

export function profileResponse(member: Member) {
  return {
    ...memberSummary(member),
    email: member.email,
    role: member.role,
  };
}