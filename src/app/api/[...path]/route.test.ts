import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../server/shared/db";
import { sessions, createSession, sessionCookie } from "../../../server/identity";
import { hashToken } from "../../../server/shared/tokens";
import { createMember } from "../../../test/factories";
import { moveIntoPast } from "../../../test/time";
import { DELETE, GET, POST } from "./route";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("API-001: an unknown /api path answers 401 to a signed-out read or same-site write", async () => {
  const read = await GET(new Request("http://localhost:3000/api/anything"));
  const write = await POST(
    new Request("http://localhost:3000/api/anything", {
      method: "POST",
      headers: { Origin: "http://localhost:3000" },
    }),
  );

  expect(read.status).toBe(401);
  expect(await read.json()).toEqual({ error: { message: "Sign in to continue." } });
  expect(write.status).toBe(401);
});

async function signedInCookie() {
  const member = await createMember();
  const token = await createSession(member.id);
  return { token, cookie: `session=${token}` };
}

it("API-001, SEC-004.1: signed in, an unknown /api path answers 404 and a cross-site DELETE of WEB-42 is rejected with 403", async () => {
  const { cookie } = await signedInCookie();

  const response = await GET(
    new Request("http://localhost:3000/api/anything", { headers: { Cookie: cookie } }),
  );
  const crossSite = await DELETE(
    new Request("http://localhost:3000/api/issues/WEB-42", {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
    }),
  );

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: { message: "Not found" } });
  expect(crossSite.status).toBe(403);
});

it("REQ-006: a response to a session idle over an hour renews the cookie", async () => {
  const { token, cookie } = await signedInCookie();
  const [{ id }] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)));
  await moveIntoPast(sessions.lastActiveAt, id, "2 hours");

  const renewed = await GET(
    new Request("http://localhost:3000/api/anything", { headers: { Cookie: cookie } }),
  );
  expect(renewed.headers.get("set-cookie")).toBe(sessionCookie(token));

  const fresh = await GET(new Request("http://localhost:3000/api/anything", { headers: { Cookie: cookie } }));
  expect(fresh.headers.get("set-cookie")).toBeNull();
});