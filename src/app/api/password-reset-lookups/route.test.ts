import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { outbox } from "../../../server/email/outbox";
import { createSession } from "../../../server/sessions";
import { createMember } from "../../../test/factories";
import { ageResetLink, jsonRequest, resetTokenFor } from "../../../test/reset-links";
import { POST as resetPassword } from "../password-resets/route";
import { DELETE as signOut } from "../sessions/current/route";
import { POST } from "./route";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  outbox.sent = [];
  outbox.failing = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function lookUp(token: unknown, headers?: Record<string, string>) {
  return POST(jsonRequest("POST", "/api/password-reset-lookups", { token }, headers));
}

function reset(token: string) {
  return resetPassword(
    jsonRequest("POST", "/api/password-resets", { token, password: "a brand new password" }),
  );
}

async function expectExpired(response: Response) {
  expect(response.status).toBe(410);
  expect(await response.json()).toEqual({ error: { message: "This link has expired" } });
}

it("REQ-050.9: a malformed link is expired", async () => {
  await expectExpired(await lookUp("not-a-real-token"));
  await expectExpired(await lookUp(42));
});

it("REQ-050.9: a link 31 minutes after sending is expired", async () => {
  const sam = await createMember();
  const token = await resetTokenFor(sam.email);
  await ageResetLink(token, "31 minutes");

  await expectExpired(await lookUp(token));
});

it("REQ-050.5: a mail scanner's lookup doesn't use the link", async () => {
  const sam = await createMember();
  const token = await resetTokenFor(sam.email);

  expect((await lookUp(token)).status).toBe(204);
  expect((await lookUp(token)).status).toBe(204);

  expect((await reset(token)).status).toBe(204);
});

it("REQ-050.8: a signed-in member's lookup doesn't use the link, which works after they sign out", async () => {
  const sam = await createMember();
  const alex = await createMember({ fullName: "Alex Kim" });
  const alexCookie = `session=${await createSession(alex.id)}`;
  const token = await resetTokenFor(sam.email);

  expect((await lookUp(token, { Cookie: alexCookie })).status).toBe(204);
  await signOut(jsonRequest("DELETE", "/api/sessions/current", undefined, { Cookie: alexCookie }));

  expect((await reset(token)).status).toBe(204);
});