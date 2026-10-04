import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../server/db";
import { outbox } from "../../../server/email/outbox";
import { hashPassword } from "../../../server/passwords";
import { members } from "../../../server/schema";
import { createSession } from "../../../server/sessions";
import { createMember } from "../../../test/factories";
import { ageResetLink, jsonRequest, resetTokenFor } from "../../../test/reset-links";
import { GET as getMe } from "../me/route";
import { POST as lookUp } from "../password-reset-lookups/route";
import { POST as signIn } from "../sessions/route";
import { POST } from "./route";

const oldPassword = "correct horse battery";
const newPassword = "a brand new password";
let oldPasswordHash: string;

beforeEach(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  outbox.sent = [];
  outbox.failing = false;
  oldPasswordHash ??= await hashPassword(oldPassword);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function reset(token: string, password = newPassword) {
  return POST(jsonRequest("POST", "/api/password-resets", { token, password }));
}

async function signInStatus(email: string, password: string) {
  return (await signIn(jsonRequest("POST", "/api/sessions", { email, password }))).status;
}

async function meStatus(cookie: string | undefined) {
  const response = await getMe(
    new Request("http://localhost:3000/api/me", { headers: cookie ? { Cookie: cookie } : {} }),
  );
  return response.status;
}

async function expectExpired(response: Response) {
  expect(response.status).toBe(410);
  expect(await response.json()).toEqual({ error: { message: "This link has expired" } });
  expect(response.headers.get("set-cookie")).toBeNull();
}

it("REQ-050.3: a valid new password 10 minutes after sending is set and signs Sam in", async () => {
  const sam = await createMember({ passwordHash: oldPasswordHash });
  const token = await resetTokenFor(sam.email);
  await ageResetLink(token, "10 minutes");

  const response = await reset(token);

  expect(response.status).toBe(204);
  expect(await meStatus(response.headers.get("set-cookie")?.split(";")[0])).toBe(200);
  expect(await signInStatus(sam.email, oldPassword)).toBe(422);
  expect(await signInStatus(sam.email, newPassword)).toBe(204);
});

it("REQ-050.4: submitting after 31 minutes is refused and the password is unchanged", async () => {
  const sam = await createMember({ passwordHash: oldPasswordHash });
  const token = await resetTokenFor(sam.email);
  await ageResetLink(token, "31 minutes");

  await expectExpired(await reset(token));
  expect(await signInStatus(sam.email, oldPassword)).toBe(204);
});

it("REQ-050.4: a link already used is refused", async () => {
  const sam = await createMember();
  const token = await resetTokenFor(sam.email);
  expect((await reset(token)).status).toBe(204);

  await expectExpired(await reset(token, "yet another new password"));
});

it("REQ-050.6: resetting with the second link expires the first", async () => {
  const sam = await createMember();
  const first = await resetTokenFor(sam.email);
  const second = await resetTokenFor(sam.email);

  expect((await reset(second)).status).toBe(204);

  expect((await lookUp(jsonRequest("POST", "/api/password-reset-lookups", { token: first }))).status).toBe(
    410,
  );
});

it("REQ-050.7: resetting ends Sam's session on another computer", async () => {
  const sam = await createMember();
  const otherComputer = `session=${await createSession(sam.id)}`;
  const token = await resetTokenFor(sam.email);

  expect((await reset(token)).status).toBe(204);

  expect(await meStatus(otherComputer)).toBe(401);
});

it("REQ-050: a member deactivated since the link was sent gets 410", async () => {
  const sam = await createMember({ passwordHash: oldPasswordHash });
  const token = await resetTokenFor(sam.email);
  await db.update(members).set({ deactivatedAt: new Date() }).where(eq(members.id, sam.id));

  await expectExpired(await reset(token));
});

it("REQ-048: a too-short new password gets a field error and leaves the link usable", async () => {
  const sam = await createMember();
  const token = await resetTokenFor(sam.email);

  const response = await reset(token, "Sh0rt!pass");

  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { fields: { password: "At least 12 characters" } } });
  expect((await lookUp(jsonRequest("POST", "/api/password-reset-lookups", { token }))).status).toBe(204);
});