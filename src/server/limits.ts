import "server-only";
import { isIP } from "node:net";
import { and, eq, gt, or, sql } from "drizzle-orm";
import { db } from "./db";
import { signInAttempts } from "./schema";

const failedSignInsPerEmail = 10;
const failedSignInsPerIp = 30;

export function clientIp(request: Request) {
  const rightmost = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return rightmost && isIP(rightmost) ? rightmost : "127.0.0.1";
}

export async function signInLimitReached(email: string, ip: string) {
  const [counts] = await db
    .select({
      byEmail: sql<number>`(count(*) filter (where ${signInAttempts.email} = ${email}))::int`,
      byIp: sql<number>`(count(*) filter (where ${signInAttempts.ip} = ${ip}))::int`,
    })
    .from(signInAttempts)
    .where(
      and(
        gt(signInAttempts.createdAt, sql`now() - interval '1 hour'`),
        or(eq(signInAttempts.email, email), eq(signInAttempts.ip, ip)),
      ),
    );
  return counts.byEmail >= failedSignInsPerEmail || counts.byIp >= failedSignInsPerIp;
}

export async function recordFailedSignIn(email: string, ip: string) {
  await db.insert(signInAttempts).values({ email, ip });
}