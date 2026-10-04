import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hashPassword } from "../../../server/passwords";
import { createSession } from "../../../server/sessions";
import { createMember } from "../../../test/factories";
import { GET } from "./route";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function getMe(cookie?: string) {
  return GET(new Request("http://localhost:3000/api/me", { headers: cookie ? { Cookie: cookie } : {} }));
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