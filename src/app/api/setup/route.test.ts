import { sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { members } from "../../../server/identity";
import { db } from "../../../server/shared/db";
import { jsonRequest } from "../../../test/reset-links";
import { POST as checkSecret } from "../setup-checks/route";
import { GET, POST } from "./route";

const secret = "s3tup-secret-that-is-long-enough-to-pass";

beforeEach(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubEnv("SETUP_SECRET", secret);
  await db.execute(sql`truncate ${members} cascade`);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function needed() {
  const response = await GET(new Request("http://localhost:3000/api/setup"));
  expect(response.status).toBe(200);
  return response.json();
}

it("OPS-001.1: setup is needed, the secret checks out, and creating the admin answers 201 with the profile and a session cookie", async () => {
  expect(await needed()).toEqual({ needed: true });
  expect((await checkSecret(jsonRequest("POST", "/api/setup-checks", { secret }))).status).toBe(204);

  const response = await POST(
    jsonRequest("POST", "/api/setup", {
      secret,
      email: "owner@x.com",
      fullName: "Sam Lee",
      username: "Sam",
      password: "correct horse battery",
    }),
  );

  expect(response.status).toBe(201);
  expect(response.headers.get("set-cookie")).toMatch(/^session=/);
  expect(await response.json()).toEqual({
    username: "sam",
    fullName: "Sam Lee",
    initials: "SL",
    deactivated: false,
    email: "owner@x.com",
    role: "admin",
  });
  expect(await needed()).toEqual({ needed: false });
});