import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../server/db";
import { hashPassword } from "../../../server/passwords";
import { members } from "../../../server/schema";
import { createSession } from "../../../server/sessions";
import { createMember } from "../../../test/factories";
import { jsonRequest } from "../../../test/reset-links";
import { GET, PATCH } from "./route";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function getMe(cookie?: string) {
  return GET(new Request("http://localhost:3000/api/me", { headers: cookie ? { Cookie: cookie } : {} }));
}

function patchMe(cookie: string | undefined, body: unknown) {
  return PATCH(jsonRequest("PATCH", "/api/me", body, cookie ? { Cookie: cookie } : {}));
}

async function storedMember(id: string) {
  const [member] = await db.select().from(members).where(eq(members.id, id));
  return member;
}

it("REQ-003.3: GET /api/me shows the profile with username and email", async () => {
  const sam = await createMember({ fullName: "Sam Rivera", role: "admin" });

  const response = await getMe(`session=${await createSession(sam.id)}`);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    username: sam.username,
    fullName: "Sam Rivera",
    initials: "SR",
    deactivated: false,
    email: sam.email,
    role: "admin",
  });
});

it("SEC-008.2: GET /api/me contains no password or password hash", async () => {
  const passwordHash = await hashPassword("correct horse battery");
  const sam = await createMember({ passwordHash });

  const body = await (await getMe(`session=${await createSession(sam.id)}`)).text();

  expect(body).not.toContain(passwordHash);
  expect(body).not.toContain("$argon2");
  expect(body.toLowerCase()).not.toContain("password");
});

it("STD-1: GET /api/me signed out answers 401", async () => {
  expect((await getMe()).status).toBe(401);
});

it("REQ-003.3: PATCH /api/me saves a new full name", async () => {
  const sam = await createMember({ fullName: "Sam Rivera" });
  const cookie = `session=${await createSession(sam.id)}`;

  const response = await patchMe(cookie, { fullName: "Sam Lee" });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ fullName: "Sam Lee", initials: "SL" });
  expect(await (await getMe(cookie)).json()).toMatchObject({ fullName: "Sam Lee", initials: "SL" });
});

it("REQ-003: the full name is trimmed", async () => {
  const sam = await createMember();

  await patchMe(`session=${await createSession(sam.id)}`, { fullName: "  Sam Lee  " });

  expect((await storedMember(sam.id)).fullName).toBe("Sam Lee");
});

it.each(["", "   "])('REQ-003: the name "%s" gets "Name required"', async (fullName) => {
  const sam = await createMember({ fullName: "Sam Rivera" });

  const response = await patchMe(`session=${await createSession(sam.id)}`, { fullName });

  expect(response.status).toBe(422);
  expect((await response.json()).error.fields).toEqual({ fullName: "Name required" });
  expect((await storedMember(sam.id)).fullName).toBe("Sam Rivera");
});

it('REQ-003: a name over 60 characters after trimming gets "Too long (max 60)"', async () => {
  const sam = await createMember({ fullName: "Sam Rivera" });
  const cookie = `session=${await createSession(sam.id)}`;

  const tooLong = await patchMe(cookie, { fullName: ` ${"a".repeat(61)} ` });
  expect(tooLong.status).toBe(422);
  expect((await tooLong.json()).error.fields).toEqual({ fullName: "Too long (max 60)" });
  expect((await storedMember(sam.id)).fullName).toBe("Sam Rivera");

  expect((await patchMe(cookie, { fullName: ` ${"a".repeat(60)} ` })).status).toBe(200);
  expect((await storedMember(sam.id)).fullName).toBe("a".repeat(60));
});

it.each([
  ["username", "someone-else"],
  ["email", "someone@else.test"],
])("REQ-003.3: changing the %s is refused", async (field, value) => {
  const sam = await createMember();

  const response = await patchMe(`session=${await createSession(sam.id)}`, { [field]: value });

  expect(response.status).toBe(422);
  expect(Object.keys((await response.json()).error.fields)).toEqual([field]);
  const stored = await storedMember(sam.id);
  expect({ username: stored.username, email: stored.email }).toEqual({
    username: sam.username,
    email: sam.email,
  });
});

it("STD-1: PATCH /api/me signed out answers 401", async () => {
  expect((await patchMe(undefined, { fullName: "Sam Lee" })).status).toBe(401);
});