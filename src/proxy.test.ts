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

it("SEC-010.1: a page response carries the Content Security Policy", () => {
  const policy = pageResponse().headers.get("content-security-policy");
  const nonce = nonceOf(policy);
  expect(nonce).toBeTruthy();
  expect(policy).toBe(
    `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; ` +
      "img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
});

it("SEC-010.1: a page response forbids framing by other sites", () => {
  expect(pageResponse().headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
});

it("SEC-010.1: a page response sends no referrer to other sites", () => {
  expect(pageResponse().headers.get("referrer-policy")).toBe("same-origin");
});

it("D-26: each request gets a fresh nonce", () => {
  const first = nonceOf(pageResponse().headers.get("content-security-policy"));
  const second = nonceOf(pageResponse().headers.get("content-security-policy"));
  expect(first).not.toBe(second);
});

it("D-26: the nonce is forwarded to Next.js in the request's CSP header", () => {
  const response = pageResponse();
  expect(response.headers.get("x-middleware-override-headers")).toContain("content-security-policy");
  expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(
    response.headers.get("content-security-policy"),
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