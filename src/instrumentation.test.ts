import { afterEach, expect, it, vi } from "vitest";
import { onRequestError, register } from "./instrumentation";
import { spyOnLoggedErrors } from "./test/log";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("the app starts when every variable is set, and refuses to start with a variable missing or empty, naming them", () => {
  expect(() => register()).not.toThrow();

  vi.stubEnv("APP_URL", undefined);
  expect(() => register()).toThrow("Missing environment variables: APP_URL");

  vi.unstubAllEnvs();
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("EMAIL_FROM", "");
  expect(() => register()).toThrow("Missing environment variables: DATABASE_URL, EMAIL_FROM");
});

it("production refuses to start without the Resend settings", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", undefined);
  expect(() => register()).toThrow("Missing environment variables: RESEND_WEBHOOK_SECRET");
});

it("OPS-001.6: a SETUP_SECRET under 32 characters stops the app from starting, naming SETUP_SECRET", () => {
  vi.stubEnv("SETUP_SECRET", "a".repeat(20));
  expect(() => register()).toThrow("SETUP_SECRET");

  vi.stubEnv("SETUP_SECRET", "a".repeat(32));
  expect(() => register()).not.toThrow();
});

it("OPS-007.5: a page that fails to render logs one request-failed line with the method, the route pattern and the digest, never the path", () => {
  const loggedErrors = spyOnLoggedErrors();
  const error = Object.assign(new Error("render failed"), { digest: "2338717823" });

  onRequestError(
    error,
    { path: "/projects/WEB?token=secret", method: "GET", headers: { cookie: "session=abc" } },
    { routerKind: "App Router", routePath: "/[[...path]]", routeType: "render", revalidateReason: undefined },
  );

  const lines = loggedErrors();
  expect(lines).toEqual([
    expect.objectContaining({
      source: "route",
      event: "request-failed",
      method: "GET",
      route: "/[[...path]]",
      digest: "2338717823",
      error: expect.objectContaining({ message: "render failed" }),
    }),
  ]);
  expect(JSON.stringify(lines)).not.toMatch(/secret|session=|\/projects/);
});