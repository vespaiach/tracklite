import "server-only";
import { sql } from "drizzle-orm";
import * as v from "valibot";
import { FirstAdmin } from "../schemas/member";
import { db } from "./db";
import { hashPassword } from "./passwords";
import { members } from "./schema";

export async function createFirstAdmin(input: v.InferInput<typeof FirstAdmin>) {
  const result = v.safeParse(FirstAdmin, input, { abortEarly: true });
  if (!result.success) throw new Error(result.issues[0].message);
  const { email, fullName, username, password } = result.output;

  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.execute(sql`lock table ${members} in exclusive mode`);
    if ((await tx.$count(members)) > 0) throw new Error("Setup already done");
    await tx.insert(members).values({ email, fullName, username, passwordHash, role: "admin" });
  });
}