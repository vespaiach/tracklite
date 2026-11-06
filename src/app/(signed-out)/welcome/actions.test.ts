import { sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../infrastructure/db";
import { members } from "../../../infrastructure/identity/tables";
import { sessionCookieWritten } from "../../../test/actions";
import { GET as getMe } from "../../api/me/route";
import { checkSetupSecret, createFirstAdmin } from "./actions";

const secret = "s3tup-secret-that-is-long-enough-to-pass";

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("SETUP_SECRET", secret);
  await db.execute(sql`truncate ${members} cascade`);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("OPS-001.1: the secret checks out, and creating the admin signs them in", async () => {
  expect(await checkSetupSecret({ secret })).toEqual({ ok: true, data: null });

  const result = await createFirstAdmin({
    secret,
    email: "owner@x.com",
    fullName: "Sam Lee",
    username: "Sam",
    password: "correct horse battery",
  });

  expect(result).toEqual({ ok: true, data: null });
  const me = await getMe(
    new Request("http://localhost:3000/api/me", { headers: { Cookie: sessionCookieWritten() ?? "" } }),
  );
  expect(await me.json()).toEqual({
    username: "sam",
    fullName: "Sam Lee",
    initials: "SL",
    deactivated: false,
    email: "owner@x.com",
    role: "admin",
  });
});