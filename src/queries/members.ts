import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import type { Me, MemberSummary } from "../contract";
import type { Actor } from "../domain/identity/actor";
import { memberSummary } from "../domain/identity/member-summary";
import type { Username } from "../domain/shared/identifiers";
import { db } from "../infrastructure/db";
import { type Member, members } from "../infrastructure/identity/tables";

export function profileResponse(member: Member): Me {
  return {
    ...memberSummary(member),
    email: member.email,
    role: member.role,
  };
}

export async function memberProfile(username: Username): Promise<Me> {
  const [member] = await db.select().from(members).where(eq(members.username, username.value));
  return profileResponse(member);
}

export async function listMembers(actor: Actor): Promise<(Me | MemberSummary)[]> {
  const all = await db
    .select()
    .from(members)
    .orderBy(asc(sql`lower(${members.fullName})`), asc(members.username));
  return all.map(actor.role === "admin" ? profileResponse : memberSummary);
}

export async function setupNeeded() {
  return (await db.$count(members)) === 0;
}