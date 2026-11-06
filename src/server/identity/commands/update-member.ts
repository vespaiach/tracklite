import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { MemberChanges } from "../schemas";
import { DomainError } from "../../../domain/shared/domain-error";
import { db } from "../../../infrastructure/db";
import type { Transaction } from "../../../infrastructure/transaction";
import { members, sessions } from "../../../infrastructure/identity/tables";
import { assertAdmin, type Member } from "../sessions";
import { isLastAdmin, mayLeaveNoAdmin } from "../rules";
import type { Username } from "../../../domain/shared/identifiers";

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
    const [target] = username
      ? await tx.select().from(members).where(eq(members.username, username.value))
      : [];
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