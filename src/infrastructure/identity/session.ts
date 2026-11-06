import "server-only";
import { and, eq, getTableColumns, gt, isNull, sql } from "drizzle-orm";
import { DomainError } from "../../domain/shared/domain-error";
import { db } from "../db";
import { createToken, hashToken } from "../tokens";
import { type Member, members, sessions } from "./tables";

const sessionMaxAgeSeconds = 30 * 24 * 60 * 60;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function sessionCookieName() {
  return isProduction() ? "__Host-session" : "session";
}

export function sessionCookieOptions() {
  return {
    path: "/",
    maxAge: sessionMaxAgeSeconds,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction(),
  };
}

export function readSessionToken(request: Request) {
  const prefix = `${sessionCookieName()}=`;
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
  return signedInMemberBy(readSessionToken(request));
}

export async function signedInMemberBy(token: string | undefined) {
  return (await findSession(token))?.member;
}

export async function requireSession(
  token: string | undefined,
): Promise<{ member: Member; renewed: boolean }> {
  const found = await findSession(token);
  if (!token || !found) throw new DomainError("signedOut", "Sign in to continue.");

  if (!found.needsRenewal) return { member: found.member, renewed: false };
  await db.update(sessions).set({ lastActiveAt: sql`now()` }).where(eq(sessions.id, found.sessionId));
  return { member: found.member, renewed: true };
}