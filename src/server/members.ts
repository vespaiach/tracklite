import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { MemberChanges } from "../schemas/member";
import { ApiError } from "./api-error";
import { db } from "./db";
import { members, sessions } from "./schema";
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

export async function listMembers(viewer: Member) {
  const all = await db
    .select()
    .from(members)
    .orderBy(asc(sql`lower(${members.fullName})`), asc(members.username));
  return all.map(viewer.role === "admin" ? profileResponse : memberSummary);
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function keepLastAdmin(tx: Transaction, target: Member) {
  const activeAdmins = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.role, "admin"), isNull(members.deactivatedAt)))
    .for("update");
  if (activeAdmins.length === 1 && activeAdmins[0].id === target.id) {
    throw new ApiError(422, "There must be at least one admin.");
  }
}

export async function updateMember(username: string, { role, deactivated }: MemberChanges) {
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(members).where(eq(members.username, username.toLowerCase()));
    if (!target) throw new ApiError(404, "Not found");

    if (role === "member" || deactivated === true) await keepLastAdmin(tx, target);

    const changes = {
      ...(role && { role }),
      ...(deactivated === true && { deactivatedAt: sql`coalesce(${members.deactivatedAt}, now())` }),
      ...(deactivated === false && { deactivatedAt: null }),
    };
    if (Object.keys(changes).length === 0) return target;

    const [updated] = await tx.update(members).set(changes).where(eq(members.id, target.id)).returning();
    if (deactivated === true) await tx.delete(sessions).where(eq(sessions.memberId, target.id));
    return updated;
  });
}