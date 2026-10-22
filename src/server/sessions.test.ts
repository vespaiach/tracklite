import { eq, sql } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { createMember } from "../test/factories";
import { moveIntoPast } from "../test/time";
import { ApiError } from "./api-error";
import { db } from "./db";
import { members, sessions } from "./schema";
import { createSession, requireMember, sessionCookie } from "./sessions";
import { hashToken } from "./tokens";

afterEach(() => {
  vi.unstubAllEnvs();
});

function requestWithCookie(cookie?: string) {
  return new Request("http://localhost:3000/api/me", cookie ? { headers: { Cookie: cookie } } : {});
}

async function sessionRow(token: string) {
  const [row] = await db
    .select({
      id: sessions.id,
      lastActiveAt: sessions.lastActiveAt,
      secondsSinceActive: sql<number>`extract(epoch from now() - ${sessions.lastActiveAt})::float8`,
    })
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)));
  return row;
}

async function expectSignedOut(request: Request) {
  const error = await requireMember(request).catch((thrown: unknown) => thrown);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status: 401, message: "Sign in to continue." });
}

it("REQ-006.1, REQ-006: Sam uses the app every day and stays signed in; a session idle over an hour is renewed with a cookie, one idle under an hour isn't rewritten", async () => {
  const sam = await createMember({ username: "sam-006-1" });
  const token = await createSession(sam.id);
  const recent = await createSession(sam.id);
  const { id } = await sessionRow(token);
  await moveIntoPast(sessions.createdAt, id, "40 days");
  await moveIntoPast(sessions.lastActiveAt, id, "1 day");
  await moveIntoPast(sessions.lastActiveAt, (await sessionRow(recent)).id, "30 minutes");
  const recentBefore = await sessionRow(recent);

  const { member, cookie } = await requireMember(requestWithCookie(`session=${token}`));
  const { cookie: recentCookie } = await requireMember(requestWithCookie(`session=${recent}`));

  expect(member.id).toBe(sam.id);
  expect((await sessionRow(token)).secondsSinceActive).toBeLessThan(60);
  expect(cookie).toBe(sessionCookie(token));
  expect(recentCookie).toBeUndefined();
  expect((await sessionRow(recent)).lastActiveAt).toEqual(recentBefore.lastActiveAt);
});

it("REQ-006.2, REQ-007.4, REQ-006: a session idle 31 days, a deactivated member's session, and a missing or unknown cookie get 401; the deactivated member's session row is kept", async () => {
  const sam = await createMember();
  const away = await createSession(sam.id);
  await moveIntoPast(sessions.lastActiveAt, (await sessionRow(away)).id, "31 days");
  const jo = await createMember();
  const deactivated = await createSession(jo.id);
  await db.update(members).set({ deactivatedAt: sql`now()` }).where(eq(members.id, jo.id));

  await expectSignedOut(requestWithCookie(`session=${away}`));
  await expectSignedOut(requestWithCookie(`session=${deactivated}`));
  await expectSignedOut(requestWithCookie());
  await expectSignedOut(requestWithCookie("theme=dark; session=not-a-real-token"));
  expect(await sessionRow(deactivated)).toBeDefined();
});

it("SEC-004: the session cookie is HttpOnly, SameSite=Lax, Path=/ and lasts 30 days, without Secure in development; in production it is __Host-session and Secure, and only that name is read", async () => {
  expect(sessionCookie("abc")).toBe("session=abc; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax");

  vi.stubEnv("NODE_ENV", "production");
  expect(sessionCookie("abc")).toBe(
    "__Host-session=abc; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure",
  );

  const sam = await createMember();
  const token = await createSession(sam.id);
  await expectSignedOut(requestWithCookie(`session=${token}`));
  const { member } = await requireMember(requestWithCookie(`__Host-session=${token}`));
  expect(member.id).toBe(sam.id);
});

it("SEC-003, SEC-003.1: every session gets a fresh 32-byte token, only its hash is stored, and the stored hash doesn't work as a token", async () => {
  const sam = await createMember();
  const first = await createSession(sam.id);
  const second = await createSession(sam.id);

  expect(Buffer.from(first, "base64url")).toHaveLength(32);
  expect(first).not.toBe(second);
  const rows = await db.select().from(sessions).where(eq(sessions.memberId, sam.id));
  expect(rows.map((row) => row.tokenHash.toString("hex")).sort()).toEqual(
    [hashToken(first), hashToken(second)].map((hash) => hash.toString("hex")).sort(),
  );
  const [stored] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(first)));
  expect(stored.tokenHash.includes(Buffer.from(first, "base64url"))).toBe(false);
  expect(stored.tokenHash.toString("latin1")).not.toContain(first);
  await expectSignedOut(requestWithCookie(`session=${stored.tokenHash.toString("base64url")}`));
});