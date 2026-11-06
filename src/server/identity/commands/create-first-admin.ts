import "server-only";
import { sql } from "drizzle-orm";
import type { FirstAdmin } from "../schemas";
import { db } from "../../../infrastructure/db";
import { hashPassword } from "../../../infrastructure/passwords";
import { createSession } from "../sessions";
import { members } from "../../../infrastructure/identity/tables";
import { setupDone } from "../setup";
import { checkSetupSecret } from "./check-setup-secret";

export async function createFirstAdmin({ secret, email, fullName, username, password }: FirstAdmin) {
  await checkSetupSecret(secret);

  const passwordHash = await hashPassword(password);

  return db.transaction(async (tx) => {
    await tx.execute(sql`lock table ${members} in exclusive mode`);

    if ((await tx.$count(members)) > 0) throw setupDone();

    const [member] = await tx
      .insert(members)
      .values({ email, fullName, username, passwordHash, role: "admin" })
      .returning();

    return { member, sessionToken: await createSession(member.id, tx) };
  });
}