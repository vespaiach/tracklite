import "server-only";
import { and, eq, getTableColumns, gt, isNull, sql } from "drizzle-orm";
import { ApiError } from "./api-error";
import { db } from "./db";
import { members, sessions } from "./schema";
import { createToken, hashToken } from "./tokens";

export type Member = typeof members.$inferSelect;
export type Admin = Member & { role: "admin" };

const sessionMaxAgeSeconds = 30 * 24 * 60 * 60;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function cookieName() {
  return isProduction() ? "__Host-session" : "session";
}

function cookieWith(value: string, maxAgeSeconds: number) {
  const attributes = [
    `${cookieName()}=${value}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (isProduction()) attributes.push("Secure");
  return attributes.join("; ");
}

export function sessionCookie(token: string) {
  return cookieWith(token, sessionMaxAgeSeconds);
}

export function clearedSessionCookie() {
  return cookieWith("", 0);
}

export function readSessionToken(request: Request) {
  const prefix = `${cookieName()}=`;
  const pair = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return pair?.slice(prefix.length);
}

export async function createSession(memberId: string, executor: Pick<typeof db, "insert"> = db) {
  const token = createToken();
  await executor.insert(sessions).values({ memberId, tokenHash: hashToken(token) });
  return token;
}

export async function endSession(token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

async function findSession(token: string | undefined) {
  if (!token) return undefined;
  const [found] = await db
    .select({
      member: getTableColumns(members),
      sessionId: sessions.id,
      needsRenewal: sql<boolean>`${sessions.lastActiveAt} < now() - interval '1 hour'`,
    })
    .from(sessions)
    .innerJoin(members, eq(members.id, sessions.memberId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        gt(sessions.lastActiveAt, sql`now() - interval '30 days'`),
        isNull(members.deactivatedAt),
      ),
    );
  return found;
}

export async function signedInMember(request: Request) {
  return (await findSession(readSessionToken(request)))?.member;
}

export async function requireMember(request: Request): Promise<{ member: Member; cookie?: string }> {
  const token = readSessionToken(request);
  const found = await findSession(token);
  if (!token || !found) throw new ApiError(401, "Sign in to continue.");

  if (!found.needsRenewal) return { member: found.member };
  await db.update(sessions).set({ lastActiveAt: sql`now()` }).where(eq(sessions.id, found.sessionId));
  return { member: found.member, cookie: sessionCookie(token) };
}

export function assertAdmin(member: Member): asserts member is Admin {
  if (member.role !== "admin") throw new ApiError(403, "You don't have permission to do that.");
}