import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { expect, it } from "vitest";
import { config, proxy } from "./proxy";

function pageResponse() {
  return proxy(new NextRequest("http://localhost:3000/my-issues"));
}

function nonceOf(policy: string | null) {
  return policy?.match(/'nonce-([^']+)'/)?.[1];
}

it("SEC-010.1: a page response carries the Content Security Policy, which forbids framing by other sites, and sends no referrer to other sites", () => {
  const response = pageResponse();
  const policy = response.headers.get("content-security-policy");
  const nonce = nonceOf(policy);
  expect(nonce).toBeTruthy();
  expect(policy).toBe(
    `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; ` +
      "img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});

it("D-26: each request gets a fresh nonce, forwarded to Next.js in the request's CSP header", () => {
  const first = pageResponse();
  const second = pageResponse();

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