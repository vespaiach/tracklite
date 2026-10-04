import { randomBytes } from "node:crypto";
import { db } from "../server/db";
import { members } from "../server/schema";

type NewMember = typeof members.$inferInsert;

export async function createMember(overrides: Partial<NewMember> = {}) {
  const suffix = randomBytes(5).toString("hex");
  const [member] = await db
    .insert(members)
    .values({
      email: `member-${suffix}@example.test`,
      fullName: `Member ${suffix}`,
      username: `m-${suffix}`,
      passwordHash: "not-a-real-hash",
      role: "member",
      ...overrides,
    })
    .returning();
  return member;
}