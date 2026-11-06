import "server-only";
import { and, asc, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { Member } from "../../domain/identity/member";
import type { MemberRepository } from "../../domain/identity/member-repository";
import type { TransactionScope } from "../unit-of-work";
import { toMember, toRow } from "./member-mapper";
import { members } from "./tables";

export function drizzleMemberRepository({ tx, saved }: TransactionScope): MemberRepository {
  async function lockedWhere(condition: SQL | undefined) {
    const [row] = await tx.select().from(members).where(condition).for("update");
    return row && toMember(row);
  }

  return {
    get: (id) => lockedWhere(eq(members.id, id)),

    getByUsername: (username) => lockedWhere(eq(members.username, username.value)),

    activeByEmail: (normalizedEmail) =>
      lockedWhere(and(eq(sql`lower(${members.email})`, normalizedEmail), isNull(members.deactivatedAt))),

    async lockActiveAdminIds() {
      const admins = await tx
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.role, "admin"), isNull(members.deactivatedAt)))
        .orderBy(asc(members.id))
        .for("update");
      return admins.map((admin) => admin.id);
    },

    async lockAgainstNewMembers() {
      await tx.execute(sql`lock table ${members} in exclusive mode`);
    },

    count: () => tx.$count(members),

    async add(member: Member) {
      await tx.insert(members).values(toRow(member));
      saved(member);
    },

    async save(member: Member) {
      const { fullName, role, passwordHash, deactivatedAt } = toRow(member);
      await tx
        .update(members)
        .set({ fullName, role, passwordHash, deactivatedAt })
        .where(eq(members.id, member.id));
      saved(member);
    },
  };
}