import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../server/db";
import { sessions } from "../../../server/schema";
import { createSession, sessionCookie } from "../../../server/sessions";
import { hashToken } from "../../../server/tokens";
import { createMember } from "../../../test/factories";
import { moveIntoPast } from "../../../test/time";
import { DELETE, GET, POST } from "./route";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("API-001: an unknown /api path answers 401 while signed out", async () => {
  const response = await GET(new Request("http://localhost:3000/api/anything"));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: { message: "Sign in to continue." } });
});

it("API-001: a same-site write to an unknown /api path answers 401", async () => {
  const response = await POST(
    new Request("http://localhost:3000/api/anything", {
      method: "POST",
      headers: { Origin: "http://localhost:3000" },
    }),
  );
  expect(response.status).toBe(401);
});

async function signedInCookie() {
  const member = await createMember();
  const token = await createSession(member.id);
  return { token, cookie: `session=${token}` };
}

it("API-001: an unknown /api path answers 404 when signed in", async () => {
  const { cookie } = await signedInCookie();
  const response = await GET(
    new Request("http://localhost:3000/api/anything", { headers: { Cookie: cookie } }),
  );
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: { message: "Not found" } });
});

it("SEC-004.1: a signed-in member's cross-site DELETE of WEB-42 is rejected with 403", async () => {
  const { cookie } = await signedInCookie();
  const response = await DELETE(
    new Request("http://localhost:3000/api/issues/WEB-42", {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
    }),
  );
  expect(response.status).toBe(403);
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