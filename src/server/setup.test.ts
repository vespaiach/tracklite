import { sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST as signIn } from "../app/api/sessions/route";
import { jsonRequest } from "../test/reset-links";
import { db } from "./db";
import { members } from "./schema";
import { createFirstAdmin } from "./setup";

const admin = {
  email: "sam@acme.com",
  fullName: "Sam Rivera",
  username: "sam",
  password: "correct horse battery",
};

beforeEach(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  await db.execute(sql`truncate ${members} cascade`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function memberCount() {
  return db.$count(members);
}

it("OPS-001.1: on a fresh install the admin is created and can sign in", async () => {
  await createFirstAdmin(admin);

  const [stored] = await db.select().from(members);
  expect(stored).toMatchObject({ email: admin.email, fullName: admin.fullName, role: "admin" });
  const response = await signIn(
    jsonRequest("POST", "/api/sessions", { email: admin.email, password: admin.password }),
  );
  expect(response.status).toBe(204);
});

it('OPS-001.2: when members exist it refuses with "Setup already done"', async () => {
  await createFirstAdmin(admin);

  await expect(createFirstAdmin({ ...admin, email: "alex@acme.com", username: "alex" })).rejects.toThrow(
    "Setup already done",
  );
  expect(await memberCount()).toBe(1);
});

it('REQ-003.1: username "Sam" is saved as "sam"', async () => {
  await createFirstAdmin({ ...admin, username: "Sam" });

  const [stored] = await db.select().from(members);
  expect(stored.username).toBe("sam");
});

it.each([
  [{ fullName: "   " }, "Name required"],
  [{ username: "s" }, "Use 2 to 20 letters, digits or hyphens"],
  [{ username: "sam_rivera" }, "Use 2 to 20 letters, digits or hyphens"],
  [{ password: "Sh0rt!pass" }, "At least 12 characters"],
])("OPS-001: %o is refused with %s", async (change, message) => {
  await expect(createFirstAdmin({ ...admin, ...change })).rejects.toThrow(message);
  expect(await memberCount()).toBe(0);
});