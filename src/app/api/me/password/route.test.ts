import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hashPassword } from "../../../../server/passwords";
import { createSession } from "../../../../server/sessions";
import { createMember } from "../../../../test/factories";
import { jsonRequest } from "../../../../test/reset-links";
import { POST as signIn } from "../../sessions/route";
import { GET as getMe } from "../route";
import { PUT } from "./route";

const oldPassword = "correct horse battery";
const newPassword = "a brand new password";
let oldPasswordHash: string;

beforeEach(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  oldPasswordHash ??= await hashPassword(oldPassword);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function signedInSam() {
  const sam = await createMember({ passwordHash: oldPasswordHash });
  return { sam, cookie: `session=${await createSession(sam.id)}` };
}

function changePassword(cookie: string, currentPassword: string, password = newPassword) {
  return PUT(
    jsonRequest("PUT", "/api/me/password", { currentPassword, newPassword: password }, { Cookie: cookie }),
  );
}

async function signInStatus(email: string, password: string) {
  return (await signIn(jsonRequest("POST", "/api/sessions", { email, password }))).status;
}

async function meStatus(cookie: string) {
  return (await getMe(new Request("http://localhost:3000/api/me", { headers: { Cookie: cookie } }))).status;
}

it("REQ-049.1: the right current password and a valid new one are saved; this session stays and others end", async () => {
  const { sam, cookie } = await signedInSam();
  const otherComputer = `session=${await createSession(sam.id)}`;

  const response = await changePassword(cookie, oldPassword);

  expect(response.status).toBe(204);
  expect(await meStatus(cookie)).toBe(200);
  expect(await meStatus(otherComputer)).toBe(401);
  expect(await signInStatus(sam.email, oldPassword)).toBe(422);
  expect(await signInStatus(sam.email, newPassword)).toBe(204);
});

it('REQ-049.2: a wrong current password gets "Incorrect password" and the old password still works', async () => {
  const { sam, cookie } = await signedInSam();

  const response = await changePassword(cookie, "not my password at all");

  expect(response.status).toBe(422);
  expect((await response.json()).error.fields).toEqual({ currentPassword: "Incorrect password" });
  expect(await signInStatus(sam.email, oldPassword)).toBe(204);
});

it("REQ-049.3: after 10 wrong current passwords the 11th try is refused even when right", async () => {
  const { sam, cookie } = await signedInSam();
  for (let i = 0; i < 10; i++) {
    expect((await changePassword(cookie, "not my password at all")).status).toBe(422);
  }

  const response = await changePassword(cookie, oldPassword);

  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ error: { message: "Too many attempts. Try again later." } });
  expect(await signInStatus(sam.email, newPassword)).toBe(429);
  expect(await meStatus(cookie)).toBe(200);
});

it("SEC-001: wrong current passwords count toward the sign-in limit", async () => {
  const { sam, cookie } = await signedInSam();
  for (let i = 0; i < 10; i++) await changePassword(cookie, "not my password at all");

  expect(await signInStatus(sam.email, oldPassword)).toBe(429);
});

it('REQ-048: a new password that is too short gets "At least 12 characters"', async () => {
  const { sam, cookie } = await signedInSam();

  const response = await changePassword(cookie, oldPassword, "Sh0rt!pass");

  expect(response.status).toBe(422);
  expect((await response.json()).error.fields).toEqual({ newPassword: "At least 12 characters" });
  expect(await signInStatus(sam.email, oldPassword)).toBe(204);
});