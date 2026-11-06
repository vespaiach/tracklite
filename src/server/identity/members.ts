import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../infrastructure/db";
import { type Member, members } from "../../infrastructure/identity/tables";

export { memberSummary } from "../../domain/identity/member-summary";

export async function activeMemberByEmail(normalizedEmail: string): Promise<Member | undefined> {
  const [member] = await db
    .select()
    .from(members)
    .where(and(eq(sql`lower(${members.email})`, normalizedEmail), isNull(members.deactivatedAt)));
  return member;
}