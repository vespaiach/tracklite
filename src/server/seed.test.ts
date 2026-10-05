import { isNotNull, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST as signIn } from "../app/api/sessions/route";
import { jsonRequest } from "../test/reset-links";
import { db } from "./db";
import { members } from "./schema";
import { seededMembers, seedMembers, seedPassword } from "./seed";

beforeEach(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  await db.execute(sql`truncate ${members} cascade`);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("seed: creates admins, members and a deactivated member", async () => {
  await seedMembers();

  expect(await db.$count(members, sql`${members.role} = 'admin'`)).toBe(2);
  expect(await db.$count(members, sql`${members.role} = 'member'`)).toBe(5);
  expect(await db.$count(members, isNotNull(members.deactivatedAt))).toBe(1);
});

it("seed: a seeded admin and member can sign in", async () => {
  await seedMembers();

  const admin = seededMembers.find((member) => member.role === "admin" && !member.deactivated);
  const member = seededMembers.find((member) => member.role === "member" && !member.deactivated);
  for (const { email } of [admin, member].map((found) => found as NonNullable<typeof found>)) {
    const response = await signIn(jsonRequest("POST", "/api/sessions", { email, password: seedPassword }));
    expect(response.status).toBe(204);
  }
});

it("seed: running twice adds no duplicates", async () => {
  await seedMembers();
  await seedMembers();

  expect(await db.$count(members)).toBe(7);
});

it("seed: refuses when NODE_ENV is production", async () => {
  vi.stubEnv("NODE_ENV", "production");

  await expect(seedMembers()).rejects.toThrow("Seeding is for development only");
  expect(await db.$count(members)).toBe(0);
});