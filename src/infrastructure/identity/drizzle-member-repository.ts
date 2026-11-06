import "server-only";
import { and, asc, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { Member, MemberProps } from "../../domain/identity/member";
import type { MemberRepository } from "../../domain/identity/member-repository";
import type { TransactionScope } from "../unit-of-work";
import { toMember, toRow } from "./member-mapper";
import { members } from "./tables";

export function drizzleMemberRepository({ tx, saved }: TransactionScope): MemberRepository {
  const loaded = new WeakMap<Member, Readonly<MemberProps>>();

  async function lockedWhere(condition: SQL | undefined) {
    const [row] = await tx.select().from(members).where(condition).for("update");
    if (!row) return undefined;

    const member = toMember(row);
    loaded.set(member, member.props);
    return member;
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

    async save(member) {
      const before = loaded.get(member);
      if (before) await updateChanged(member.props, before);
      else await tx.insert(members).values(toRow(member.props));

      loaded.set(member, member.props);
      saved(member);
    },
  };

  async function updateChanged(after: MemberProps, before: MemberProps) {
    const changes = changedColumns(toRow(after), toRow(before));
    if (Object.keys(changes).length === 0) return;
    await tx.update(members).set(changes).where(eq(members.id, after.id));
  }
}

function changedColumns(after: ReturnType<typeof toRow>, before: ReturnType<typeof toRow>) {
  return Object.fromEntries(
    Object.entries(after).filter(([column, value]) => value !== before[column as keyof typeof before]),
  );
}