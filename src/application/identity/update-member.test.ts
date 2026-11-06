import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { Role } from "../../domain/identity/role";
import { Username } from "../../domain/shared/identifiers";
import { db } from "../../infrastructure/db";
import { identityWork } from "../../infrastructure/identity/repositories";
import { type Member, members } from "../../infrastructure/identity/tables";
import { createMember } from "../../test/factories";
import { updateMember } from "./update-member";

it("STD-2: a member can't change a role or deactivate", async () => {
  const member = await createMember();
  const target = await createMember({ role: "admin" });
  const forbidden = { kind: "forbidden", message: "You don't have permission to do that." };

  await expect(
    updateMember(member, identityWork, Username.from(target.username), { role: Role.member }),
  ).rejects.toMatchObject(forbidden);
  await expect(
    updateMember(member, identityWork, Username.from(target.username), { deactivated: true }),
  ).rejects.toMatchObject(forbidden);

  const [stored] = await db.select().from(members).where(eq(members.id, target.id));
  expect(stored.role).toBe("admin");
  expect(stored.deactivatedAt).toBeNull();
});

async function makeOnlyAdmins(...admins: Member[]) {
  await db
    .update(members)
    .set({ role: "member" })
    .where(
      and(
        eq(members.role, "admin"),
        isNull(members.deactivatedAt),
        notInArray(
          members.id,
          admins.map((admin) => admin.id),
        ),
      ),
    );
}

function activeAdmins(executor: Pick<typeof db, "select"> = db) {
  return executor
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.role, "admin"), isNull(members.deactivatedAt)));
}

async function waitForLockWaiters(count: number) {
  for (;;) {
    const [{ waiting }] = await db.execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if (waiting >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function whileAdminRowsLocked<T>(start: () => Promise<T>, lockWaiters: number) {
  let lockTaken!: () => void;
  let release!: () => void;
  const taken = new Promise<void>((resolve) => {
    lockTaken = resolve;
  });
  const holder = db.transaction(async (tx) => {
    await activeAdmins(tx).for("update");
    lockTaken();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  await taken;
  const started = start();
  await waitForLockWaiters(lockWaiters);
  release();
  await holder;
  return started;
}

it("REQ-052.3: two admins removing each other's admin role at once leaves one admin", async () => {
  const alex = await createMember({ role: "admin" });
  const jo = await createMember({ role: "admin" });
  await makeOnlyAdmins(alex, jo);

  const outcomes = await whileAdminRowsLocked(
    () =>
      Promise.allSettled([
        updateMember(alex, identityWork, Username.from(jo.username), { role: Role.member }),
        updateMember(jo, identityWork, Username.from(alex.username), { role: Role.member }),
      ]),
    2,
  );

  expect(outcomes.map((each) => each.status).sort()).toEqual(["fulfilled", "rejected"]);
  expect(outcomes.find((each) => each.status === "rejected")).toMatchObject({
    reason: { kind: "invalid", message: "There must be at least one admin." },
  });
  expect(await activeAdmins()).toHaveLength(1);
});