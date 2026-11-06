import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession, sessionCookieName } from "../../infrastructure/identity/session";
import { createMember } from "../../test/factories";
import { setNextRequest, writtenCookies } from "../../test/next-request";
import { GET as getMe } from "../api/me/route";
import { signOut } from "./actions";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function meStatus(token: string) {
  const response = await getMe(
    new Request("http://localhost:3000/api/me", { headers: { Cookie: `session=${token}` } }),
  );
  return response.status;
}

it("REQ-006, REQ-050.8, REQ-002.3: signing out ends the session on this browser only and clears the cookie, also without a session", async () => {
  const sam = await createMember();
  const laptop = await createSession(sam.id);
  const phone = await createSession(sam.id);
  setNextRequest({ cookies: { [sessionCookieName()]: laptop } });

  expect(await signOut({})).toEqual({ ok: true, data: null });

  expect(writtenCookies()).toEqual([
    { name: sessionCookieName(), value: "", options: expect.objectContaining({ maxAge: 0 }) },
  ]);
  expect(await meStatus(laptop)).toBe(401);
  expect(await meStatus(phone)).toBe(200);

  setNextRequest({});
  expect(await signOut({})).toEqual({ ok: true, data: null });
});