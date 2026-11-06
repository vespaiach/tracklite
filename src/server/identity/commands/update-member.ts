import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { MemberChanges, Username } from "../schemas";
import { DomainError } from "../../shared/domain-error";
import { db } from "../../shared/db";
import type { Transaction } from "../../shared/transaction";
import { members, sessions } from "../tables";
import type { Member } from "../sessions";
import { assertAdmin } from "../services/authorization";
import { isLastAdmin, mayLeaveNoAdmin } from "../services/admin-rules";

async function keepLastAdmin(tx: Transaction, target: Member) {
  const activeAdmins = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.role, "admin"), isNull(members.deactivatedAt)))
    .for("update");

  const adminIds = activeAdmins.map((admin) => admin.id);
  if (isLastAdmin(adminIds, target.id)) throw new DomainError("invalid", "There must be at least one admin.");
}

export async function updateMember(
  actor: Member,
  username: Username | undefined,
  { role, deactivated }: MemberChanges,
) {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const [target] = username ? await tx.select().from(members).where(eq(members.username, username)) : [];
    if (!target) throw new DomainError("notFound", "Not found");

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