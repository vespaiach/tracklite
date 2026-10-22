import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Me, MemberSummary } from "../../contract";
import type { MemberChanges, Username } from "./schemas";
import { ApiError } from "../shared/api-error";
import { db } from "../shared/db";
import type { Transaction } from "../shared/transaction";
import { members, sessions } from "./tables";
import { assertAdmin, type Member } from "./sessions";
import { isLastAdmin, mayLeaveNoAdmin } from "./rules";

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

export async function listMembers(actor: Member) {
  const all = await db
    .select()
    .from(members)
    .orderBy(asc(sql`lower(${members.fullName})`), asc(members.username));
  return all.map(actor.role === "admin" ? profileResponse : memberSummary);
}

async function keepLastAdmin(tx: Transaction, target: Member) {
  const activeAdmins = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.role, "admin"), isNull(members.deactivatedAt)))
    .for("update");

  const adminIds = activeAdmins.map((admin) => admin.id);
  if (isLastAdmin(adminIds, target.id)) throw new ApiError(422, "There must be at least one admin.");
}

export async function updateMember(
  actor: Member,
  username: Username | undefined,
  { role, deactivated }: MemberChanges,
) {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const [target] = username ? await tx.select().from(members).where(eq(members.username, username)) : [];
    if (!target) throw new ApiError(404, "Not found");

    if (mayLeaveNoAdmin({ role, deactivated })) await keepLastAdmin(tx, target);

    const changes = roleAndActiveUpdate({ role, deactivated });
    if (Object.keys(changes).length === 0) return target;

    const [updated] = await tx.update(members).set(changes).where(eq(members.id, target.id)).returning();

    if (deactivated === true) await tx.delete(sessions).where(eq(sessions.memberId, target.id));
    return updated;
  });
}

function roleAndActiveUpdate({ role, deactivated }: MemberChanges) {
  return {
    ...(role && { role }),
    ...(deactivated === true && { deactivatedAt: sql`coalesce(${members.deactivatedAt}, now())` }),
    ...(deactivated === false && { deactivatedAt: null }),
  };
}

export async function editConflict(tx: Transaction, editorId: string | null) {
  const [editor] = editorId
    ? await tx.select({ fullName: members.fullName }).from(members).where(eq(members.id, editorId))
    : [];
  return new ApiError(
    409,
    `This was changed by ${editor?.fullName ?? "someone else"}. Copy your text and reload.`,
  );
}