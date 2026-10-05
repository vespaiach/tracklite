import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
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

export async function listMembers(viewer: Member) {
  const all = await db
    .select()
    .from(members)
    .orderBy(asc(sql`lower(${members.fullName})`), asc(members.username));
  return all.map(viewer.role === "admin" ? profileResponse : memberSummary);
}

type Role = Member["role"];
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function isRole(value: unknown): value is Role {
  return value === "admin" || value === "member";
}

function parseMemberChanges(body: Record<string, unknown>) {
  const { role, deactivated } = body;
  const fields: Record<string, string> = {};
  if (role !== undefined && !isRole(role)) fields.role = "Choose admin or member";
  if (deactivated !== undefined && typeof deactivated !== "boolean")
    fields.deactivated = "Choose true or false";
  if (Object.keys(fields).length > 0) throw new ApiError(422, "Check the highlighted fields", fields);
  return { role: role as Role | undefined, deactivated: deactivated as boolean | undefined };
}

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

export async function updateMember(username: string, body: Record<string, unknown>) {
  const { role, deactivated } = parseMemberChanges(body);

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