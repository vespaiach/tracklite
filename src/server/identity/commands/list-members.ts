import "server-only";
import { asc, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/db";
import { members } from "../../../infrastructure/identity/tables";
import type { Member } from "../sessions";
import { memberSummary, profileResponse } from "../members";

export async function listMembers(actor: Member) {
  const all = await db
    .select()
    .from(members)
    .orderBy(asc(sql`lower(${members.fullName})`), asc(members.username));
  return all.map(actor.role === "admin" ? profileResponse : memberSummary);
}