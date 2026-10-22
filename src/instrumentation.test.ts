import { afterEach, expect, it, vi } from "vitest";
import { register } from "./instrumentation";

afterEach(() => {
  vi.unstubAllEnvs();
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