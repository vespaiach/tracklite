import "server-only";
import { isIP } from "node:net";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { ApiError } from "../shared/api-error";
import { db } from "../shared/db";
import { clientErrorReports, passwordResetRequests, signInAttempts } from "./tables";

const failedSignInsPerEmail = 10;
const failedSignInsPerIp = 30;
const resetRequestsPerEmail = 5;
const resetRequestsPerIp = 20;
const clientErrorReportsPerWindow = 30;

export function clientIp(request: Request) {
  const rightmost = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return rightmost && isIP(rightmost) ? rightmost : "127.0.0.1";
}

export function tooManyAttempts() {
  return new ApiError(429, "Too many attempts. Try again later.");
}

async function lastHourCounts(
  table: typeof signInAttempts | typeof passwordResetRequests,
  email: string,
  ip: string,
) {
  const [counts] = await db
    .select({
      byEmail: sql<number>`(count(*) filter (where ${table.email} = ${email}))::int`,
      byIp: sql<number>`(count(*) filter (where ${table.ip} = ${ip}))::int`,
    })
    .from(table)
    .where(
      and(gt(table.createdAt, sql`now() - interval '1 hour'`), or(eq(table.email, email), eq(table.ip, ip))),
    );
  return counts;
}

export async function signInLimitReached(email: string, ip: string) {
  const counts = await lastHourCounts(signInAttempts, email, ip);
  return counts.byEmail >= failedSignInsPerEmail || counts.byIp >= failedSignInsPerIp;
}

export async function recordFailedSignIn(email: string, ip: string) {
  await db.insert(signInAttempts).values({ email, ip });
}

export async function resetRequestLimitReached(email: string, ip: string) {
  const counts = await lastHourCounts(passwordResetRequests, email, ip);
  return counts.byEmail >= resetRequestsPerEmail || counts.byIp >= resetRequestsPerIp;
}

export async function recordResetRequest(email: string, ip: string) {
  await db.insert(passwordResetRequests).values({ email, ip });
}

type ClientErrorReporter = { username: string | null; ip: string };

export async function clientErrorLimitReached({ username, ip }: ClientErrorReporter) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clientErrorReports)
    .where(
      and(
        gt(clientErrorReports.createdAt, sql`now() - interval '10 minutes'`),
        username === null
          ? and(isNull(clientErrorReports.username), eq(clientErrorReports.ip, ip))
          : eq(clientErrorReports.username, username),
      ),
    );
  return count >= clientErrorReportsPerWindow;
}

export async function recordClientErrorReport(reporter: ClientErrorReporter) {
  await db.insert(clientErrorReports).values(reporter);
}