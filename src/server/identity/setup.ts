import "server-only";
import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import type { FirstAdmin } from "./schemas";
import { ApiError } from "../shared/api-error";
import { readConfig } from "../shared/config";
import { db } from "../shared/db";
import { hashPassword } from "../shared/passwords";
import { hashToken } from "../shared/tokens";
import { createSession } from "./sessions";
import { members } from "./tables";

function setupDone() {
  return new ApiError(410, "Setup already done");
}

export async function setupNeeded() {
  return (await db.$count(members)) === 0;
}

export async function checkSetupSecret(secret: string) {
  if (!(await setupNeeded())) throw setupDone();

  const configured = readConfig().setupSecret;
  if (!configured) {
    throw new ApiError(503, "Setup isn't enabled. Set SETUP_SECRET on the server and restart.");
  }

  if (!timingSafeEqual(hashToken(secret), hashToken(configured))) {
    throw new ApiError(403, "Wrong setup secret");
  }
}

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