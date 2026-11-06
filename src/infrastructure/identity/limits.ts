import "server-only";
import { isIP } from "node:net";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import type {
  ClientErrorReporter,
  RequestLimits,
  ResetRequester,
  SignInLimits,
} from "../../application/identity/ports";
import type { Executor } from "../transaction";
import { clientErrorReports, passwordResetRequests, signInAttempts } from "./tables";

const failedSignInsPerEmail = 10;
const failedSignInsPerIp = 30;
const resetRequestsPerEmail = 5;
const resetRequestsPerIp = 20;
const clientErrorReportsPerWindow = 30;

export function clientIp(headers: Headers) {
  const rightmost = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return rightmost && isIP(rightmost) ? rightmost : "127.0.0.1";
}

async function lastHourCounts(
  executor: Executor,
  table: typeof signInAttempts | typeof passwordResetRequests,
  email: string,
  ip: string,
) {
  const [counts] = await executor
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

export function signInLimits(executor: Executor): SignInLimits {
  return {
    async reached(email, ip) {
      const counts = await lastHourCounts(executor, signInAttempts, email, ip);
      return counts.byEmail >= failedSignInsPerEmail || counts.byIp >= failedSignInsPerIp;
    },
    async recordFailure(email, ip) {
      await executor.insert(signInAttempts).values({ email, ip });
    },
  };
}

export function resetRequestLimits(executor: Executor): RequestLimits<ResetRequester> {
  return {
    async reached({ email, ip }) {
      const counts = await lastHourCounts(executor, passwordResetRequests, email, ip);
      return counts.byEmail >= resetRequestsPerEmail || counts.byIp >= resetRequestsPerIp;
    },
    async record(requester) {
      await executor.insert(passwordResetRequests).values(requester);
    },
  };
}

export function clientErrorLimits(executor: Executor): RequestLimits<ClientErrorReporter> {
  return {
    async reached({ username, ip }) {
      const [{ count }] = await executor
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
    },
    async record(reporter) {
      await executor.insert(clientErrorReports).values(reporter);
    },
  };
}