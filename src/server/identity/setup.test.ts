import { sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST as signIn } from "../../app/api/sessions/route";
import { jsonRequest } from "../../test/reset-links";
import { db } from "../shared/db";
import { members } from "../shared/schema";
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

it('OPS-001.1, REQ-003.1: on a fresh install the admin is created, with username "Sam" saved as "sam", and can sign in', async () => {
  await createFirstAdmin({ ...admin, username: "Sam" });

  const [stored] = await db.select().from(members);
  expect(stored).toMatchObject({
    email: admin.email,
    fullName: admin.fullName,
    username: "sam",
    role: "admin",
  });
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

it("OPS-001: a blank name, a bad username or a short password is refused and nothing is saved", async () => {
  for (const [change, message] of [
    [{ fullName: "   " }, "Name required"],
    [{ username: "s" }, "Use 2 to 20 letters, digits or hyphens"],
    [{ username: "sam_rivera" }, "Use 2 to 20 letters, digits or hyphens"],
    [{ password: "Sh0rt!pass" }, "At least 12 characters"],
  ] as const) {
    await expect(createFirstAdmin({ ...admin, ...change })).rejects.toThrow(message);
  }
  expect(await memberCount()).toBe(0);
});