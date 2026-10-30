import { sql } from "drizzle-orm";
import * as v from "valibot";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET as getMe } from "../../app/api/me/route";
import { POST as signIn } from "../../app/api/sessions/route";
import { POST as postSetup } from "../../app/api/setup/route";
import { jsonRequest } from "../../test/reset-links";
import { db } from "../shared/db";
import { FirstAdmin } from "./schemas";
import { members } from "./tables";
import { checkSetupSecret, createFirstAdmin } from "./setup";

const secret = "s3tup-secret-that-is-long-enough-to-pass";

const admin = {
  secret,
  email: "owner@x.com",
  fullName: "Sam Lee",
  username: "sam",
  password: "correct horse battery",
};

beforeEach(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubEnv("SETUP_SECRET", secret);
  await db.execute(sql`truncate ${members} cascade`);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function memberCount() {
  return db.$count(members);
}

function firstAdmin(changes: Partial<typeof admin> = {}) {
  return createFirstAdmin(v.parse(FirstAdmin, { ...admin, ...changes }));
}

it('OPS-001.1, REQ-003.1: the right secret creates admin "Sam" as "sam", signed in, and the email and password sign in again', async () => {
  await expect(checkSetupSecret(secret)).resolves.toBeUndefined();

  const { member, sessionToken } = await firstAdmin({ username: "Sam" });

  expect(member).toMatchObject({ email: "owner@x.com", fullName: "Sam Lee", username: "sam", role: "admin" });
  const me = await getMe(
    new Request("http://localhost:3000/api/me", { headers: { Cookie: `session=${sessionToken}` } }),
  );
  expect(me.status).toBe(200);
  const response = await signIn(
    jsonRequest("POST", "/api/sessions", { email: admin.email, password: admin.password }),
  );
  expect(response.status).toBe(204);
});

it('OPS-001.2: once members exist the check and the setup are refused with "Setup already done"', async () => {
  await firstAdmin();

  const refusal = { status: 410, message: "Setup already done" };
  await expect(checkSetupSecret(secret)).rejects.toMatchObject(refusal);
  await expect(firstAdmin({ email: "alex@x.com", username: "alex" })).rejects.toMatchObject(refusal);
  expect(await memberCount()).toBe(1);
});

it('OPS-001.3: a wrong secret gets "Wrong setup secret" and nothing is saved', async () => {
  const refusal = { status: 403, message: "Wrong setup secret" };

  await expect(checkSetupSecret("not-the-secret")).rejects.toMatchObject(refusal);
  await expect(firstAdmin({ secret: `${secret}x` })).rejects.toMatchObject(refusal);
  expect(await memberCount()).toBe(0);
});

it("OPS-001.4: without SETUP_SECRET setup isn't enabled and nothing is saved", async () => {
  vi.stubEnv("SETUP_SECRET", "");
  const refusal = {
    status: 503,
    message: "Setup isn't enabled. Set SETUP_SECRET on the server and restart.",
  };

  await expect(checkSetupSecret(secret)).rejects.toMatchObject(refusal);
  await expect(firstAdmin()).rejects.toMatchObject(refusal);
  expect(await memberCount()).toBe(0);
});

it('OPS-001.7: of two setups at the same moment one creates the admin and the other gets "Setup already done"', async () => {
  const results = await Promise.allSettled([
    firstAdmin(),
    firstAdmin({ email: "alex@x.com", username: "alex" }),
  ]);

  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find((result) => result.status === "rejected")).toMatchObject({
    reason: { status: 410, message: "Setup already done" },
  });
  expect(await memberCount()).toBe(1);
});

it("OPS-001, REQ-003, REQ-048: a blank name, a bad username or a short password is refused and nothing is saved", async () => {
  const response = await postSetup(
    jsonRequest("POST", "/api/setup", {
      ...admin,
      fullName: "   ",
      username: "sam_lee",
      password: "Sh0rt!pass",
    }),
  );

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      message: "Check the highlighted fields",
      fields: {
        fullName: "Name required",
        username: "Use 2 to 20 letters, digits or hyphens",
        password: "At least 12 characters",
      },
    },
  });
  expect(await memberCount()).toBe(0);
});