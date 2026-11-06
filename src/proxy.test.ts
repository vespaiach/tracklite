import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { expect, it } from "vitest";
import { db } from "./infrastructure/db";
import { createSession } from "./infrastructure/identity/session";
import { sessions } from "./infrastructure/identity/tables";
import { hashToken } from "./infrastructure/tokens";
import { createMember } from "./test/factories";
import { config, proxy, requestPathHeader } from "./proxy";

function pageResponse() {
  return proxy(new NextRequest("http://localhost:3000/my-issues"));
}

function nonceOf(policy: string | null) {
  return policy?.match(/'nonce-([^']+)'/)?.[1];
}

it("SEC-010.1: a page response carries the Content Security Policy, which forbids framing by other sites, and sends no referrer to other sites", async () => {
  const response = await pageResponse();
  const policy = response.headers.get("content-security-policy");
  const nonce = nonceOf(policy);
  expect(nonce).toBeTruthy();
  expect(policy).toBe(
    `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; ` +
      "img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});

it("D-26: each request gets a fresh nonce, forwarded to Next.js in the request's CSP header", async () => {
  const first = await pageResponse();
  const second = await pageResponse();

  expect(nonceOf(first.headers.get("content-security-policy"))).not.toBe(
    nonceOf(second.headers.get("content-security-policy")),
  );
  expect(first.headers.get("x-middleware-override-headers")).toContain("content-security-policy");
  expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(
    first.headers.get("content-security-policy"),
  );
});

it("D-26: the proxy runs on page addresses only", () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });
  expect(matches("/")).toBe(true);
  expect(matches("/my-issues")).toBe(true);
  expect(matches("/projects/WEB/board")).toBe(true);
  expect(matches("/api/me")).toBe(false);
  expect(matches("/health")).toBe(false);
  expect(matches("/webhooks/resend")).toBe(false);
  expect(matches("/_next/static/chunks/main.js")).toBe(false);
});

it("STD-1: the proxy forwards the requested path and query, replacing any sent by the browser, so the signed-in layout can return there after sign-in", async () => {
  const response = await proxy(
    new NextRequest("http://localhost:3000/project/WEB/list?status=todo", {
      headers: { [requestPathHeader]: "//evil.example" },
    }),
  );

  expect(response.headers.get(`x-middleware-request-${requestPathHeader}`)).toBe(
    "/project/WEB/list?status=todo",
  );
});

async function sessionIdleFor(idle: string) {
  const token = await createSession((await createMember()).id);
  await db
    .update(sessions)
    .set({ lastActiveAt: sql`now() - ${idle}::interval` })
    .where(eq(sessions.tokenHash, hashToken(token)));
  return token;
}

function pageWithSession(token: string) {
  return proxy(
    new NextRequest("http://localhost:3000/issue/WEB-42", { headers: { Cookie: `session=${token}` } }),
  );
}

it("REQ-006.1, REQ-006: opening a page renews a session idle over an hour with a fresh 30-day cookie; a session idle under an hour, a stale cookie or none gets no cookie", async () => {
  const idle = await sessionIdleFor("2 hours");
  const recent = await sessionIdleFor("10 minutes");
  const expired = await sessionIdleFor("31 days");

  const renewed = await pageWithSession(idle);

  expect(renewed.cookies.get("session")).toMatchObject({
    value: idle,
    path: "/",
    maxAge: 2592000,
    httpOnly: true,
    sameSite: "lax",
  });
  for (const response of [
    await pageWithSession(recent),
    await pageWithSession(expired),
    await pageWithSession("not-a-real-token"),
    await pageResponse(),
  ]) {
    expect(response.headers.get("set-cookie")).toBeNull();
  }
});