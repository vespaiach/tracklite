import { eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { db } from "../server/db";
import { members } from "../server/schema";
import { createMember } from "./factories";
import { moveIntoPast } from "./time";

it("tests run against the separate test database", async () => {
  const [{ name }] = await db.execute<{ name: string }>(sql`select current_database() as name`);
  expect(name).toBe(new URL(process.env.TEST_DATABASE_URL ?? "").pathname.slice(1));
});

it("a factory member's created_at moves back a day", async () => {
  const member = await createMember();
  await moveIntoPast(members.createdAt, member.id, "1 day");

  const [{ age }] = await db
    .select({ age: sql<string>`date_trunc('minute', now() - ${members.createdAt})::text` })
    .from(members)
    .where(eq(members.id, member.id));
  expect(age).toBe("1 day");
});

it("factory members are distinct and can be overridden", async () => {
  const first = await createMember();
  const admin = await createMember({ role: "admin", fullName: "Ada Admin" });
  expect(admin.username).not.toBe(first.username);
  expect(admin.email).not.toBe(first.email);
  expect(admin).toMatchObject({ role: "admin", fullName: "Ada Admin" });
});