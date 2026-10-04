import { eq, sql } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { createMember } from "../test/factories";
import { moveIntoPast } from "../test/time";
import { ApiError } from "./api-error";
import { db } from "./db";
import { members, sessions } from "./schema";
import { createSession, endSession, requireMember, sessionCookie } from "./sessions";
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

it("REQ-006.1: Sam uses the app every day and stays signed in", async () => {
  const sam = await createMember({ username: "sam-006-1" });
  const token = await createSession(sam.id);
  const { id } = await sessionRow(token);
  await moveIntoPast(sessions.createdAt, id, "40 days");
  await moveIntoPast(sessions.lastActiveAt, id, "1 day");

  const { member, cookie } = await requireMember(requestWithCookie(`session=${token}`));

  expect(member.id).toBe(sam.id);
  expect((await sessionRow(token)).secondsSinceActive).toBeLessThan(60);
  expect(cookie).toBe(sessionCookie(token));
});

it("REQ-006.2: Sam returns after 31 days away and gets 401", async () => {
  const sam = await createMember();
  const token = await createSession(sam.id);
  await moveIntoPast(sessions.lastActiveAt, (await sessionRow(token)).id, "31 days");

  await expectSignedOut(requestWithCookie(`session=${token}`));
});

it("REQ-006: last_active_at under an hour old isn't rewritten and no cookie is sent", async () => {
  const sam = await createMember();
  const token = await createSession(sam.id);
  await moveIntoPast(sessions.lastActiveAt, (await sessionRow(token)).id, "30 minutes");
  const before = await sessionRow(token);

  const { cookie } = await requireMember(requestWithCookie(`session=${token}`));

  expect(cookie).toBeUndefined();
  expect((await sessionRow(token)).lastActiveAt).toEqual(before.lastActiveAt);
});

it("REQ-006: signing out ends the session on that browser only", async () => {
  const sam = await createMember();
  const laptop = await createSession(sam.id);
  const phone = await createSession(sam.id);

  await endSession(laptop);

  await expectSignedOut(requestWithCookie(`session=${laptop}`));
  const { member } = await requireMember(requestWithCookie(`session=${phone}`));
  expect(member.id).toBe(sam.id);
});

it("REQ-006: a missing or unknown session cookie gets 401", async () => {
  await expectSignedOut(requestWithCookie());
  await expectSignedOut(requestWithCookie("theme=dark; session=not-a-real-token"));
});

it("REQ-007.4: a deactivated member's session gets 401", async () => {
  const sam = await createMember();
  const token = await createSession(sam.id);
  await db.update(members).set({ deactivatedAt: sql`now()` }).where(eq(members.id, sam.id));

  await expectSignedOut(requestWithCookie(`session=${token}`));
  expect(await sessionRow(token)).toBeDefined();
});

it("SEC-004: the session cookie is HttpOnly, SameSite=Lax, Path=/ and lasts 30 days, without Secure in development", () => {
  expect(sessionCookie("abc")).toBe("session=abc; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax");
});

it("SEC-004: in production the cookie is __Host-session and Secure", async () => {
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

it("SEC-003: every session gets a fresh token and only its hash is stored", async () => {
  const sam = await createMember();
  const first = await createSession(sam.id);
  const second = await createSession(sam.id);

  expect(first).not.toBe(second);
  const rows = await db.select().from(sessions).where(eq(sessions.memberId, sam.id));
  expect(rows.map((row) => row.tokenHash.toString("hex")).sort()).toEqual(
    [hashToken(first), hashToken(second)].map((hash) => hash.toString("hex")).sort(),
  );
});