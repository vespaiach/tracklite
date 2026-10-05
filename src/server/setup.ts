import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { fullNameError, normalizeEmail, usernameError } from "./members";
import { hashPassword, passwordError } from "./passwords";
import { members } from "./schema";

type FirstAdmin = { email: string; fullName: string; username: string; password: string };

export async function createFirstAdmin(admin: FirstAdmin) {
  const fullName = admin.fullName.trim();
  const username = admin.username.trim().toLowerCase();
  const error = fullNameError(fullName) ?? usernameError(username) ?? passwordError(admin.password);
  if (error) throw new Error(error);

  const passwordHash = await hashPassword(admin.password);
  await db.transaction(async (tx) => {
    await tx.execute(sql`lock table ${members} in exclusive mode`);
    if ((await tx.$count(members)) > 0) throw new Error("Setup already done");
    await tx
      .insert(members)
      .values({ email: normalizeEmail(admin.email), fullName, username, passwordHash, role: "admin" });
  });
}