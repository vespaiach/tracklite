import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../../server/sessions";
import { createMember } from "../../../../test/factories";
import { GET as getMe } from "../../me/route";
import { DELETE } from "./route";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function signOut(cookie?: string) {
  return DELETE(
    new Request("http://localhost:3000/api/sessions/current", {
      method: "DELETE",
      headers: { Origin: "http://localhost:3000", ...(cookie ? { Cookie: cookie } : {}) },
    }),
  );
}

async function meStatus(cookie: string) {
  return (await getMe(new Request("http://localhost:3000/api/me", { headers: { Cookie: cookie } }))).status;
}

it("REQ-006: signing out ends the session on this browser only, and still answers 204 without a session", async () => {
  const sam = await createMember();
  const laptop = `session=${await createSession(sam.id)}`;
  const phone = `session=${await createSession(sam.id)}`;

  const response = await signOut(laptop);

  expect(response.status).toBe(204);
  expect(response.headers.get("set-cookie")).toMatch(/^session=; .*Max-Age=0/);
  expect(await meStatus(laptop)).toBe(401);
  expect(await meStatus(phone)).toBe(200);
  expect((await signOut()).status).toBe(204);
});