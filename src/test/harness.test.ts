import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { db } from "../server/db";

it("tests run against the separate test database", async () => {
  const [{ name }] = await db.execute<{ name: string }>(sql`select current_database() as name`);
  expect(name).toBe(new URL(process.env.TEST_DATABASE_URL ?? "").pathname.slice(1));
});