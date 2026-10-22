import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../server/shared/db";
import { hashPassword } from "../../../server/shared/passwords";
import { members } from "../../../server/shared/schema";
import { createSession } from "../../../server/identity";
import { createMember } from "../../../test/factories";
import { jsonRequest } from "../../../test/reset-links";
import { GET, PATCH } from "./route";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function getMe(cookie: string) {
  return GET(new Request("http://localhost:3000/api/me", { headers: { Cookie: cookie } }));
}

function patchMe(cookie: string, body: unknown) {
  return PATCH(jsonRequest("PATCH", "/api/me", body, { Cookie: cookie }));
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

it("REQ-003.3, REQ-003: PATCH /api/me saves a new, trimmed full name", async () => {
  const sam = await createMember({ fullName: "Sam Rivera" });
  const cookie = `session=${await createSession(sam.id)}`;

  const response = await patchMe(cookie, { fullName: "  Sam Lee  " });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ fullName: "Sam Lee", initials: "SL" });
  expect(await (await getMe(cookie)).json()).toMatchObject({ fullName: "Sam Lee", initials: "SL" });
  expect((await storedMember(sam.id)).fullName).toBe("Sam Lee");
});

it('REQ-003: an empty or blank name gets "Name required" and one over 60 characters after trimming gets "Too long (max 60)"; 60 is saved', async () => {
  const sam = await createMember({ fullName: "Sam Rivera" });
  const cookie = `session=${await createSession(sam.id)}`;

  for (const [fullName, message] of [
    ["", "Name required"],
    ["   ", "Name required"],
    [` ${"a".repeat(61)} `, "Too long (max 60)"],
  ]) {
    const response = await patchMe(cookie, { fullName });
    expect(response.status).toBe(422);
    expect((await response.json()).error.fields).toEqual({ fullName: message });
  }
  expect((await storedMember(sam.id)).fullName).toBe("Sam Rivera");

  expect((await patchMe(cookie, { fullName: ` ${"a".repeat(60)} ` })).status).toBe(200);
  expect((await storedMember(sam.id)).fullName).toBe("a".repeat(60));
});

it("REQ-003.3: changing the username or email is refused", async () => {
  const sam = await createMember();
  const cookie = `session=${await createSession(sam.id)}`;

  for (const [field, value] of [
    ["username", "someone-else"],
    ["email", "someone@else.test"],
  ]) {
    const response = await patchMe(cookie, { [field]: value });
    expect(response.status).toBe(422);
    expect(Object.keys((await response.json()).error.fields)).toEqual([field]);
  }
  const stored = await storedMember(sam.id);
  expect({ username: stored.username, email: stored.email }).toEqual({
    username: sam.username,
    email: sam.email,
  });
});