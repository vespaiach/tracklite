import { afterEach, expect, it, vi } from "vitest";
import { register } from "./instrumentation";

afterEach(() => {
  vi.unstubAllEnvs();
});

it("the app starts when every variable is set", () => {
  expect(() => register()).not.toThrow();
});

it("the app refuses to start with a variable missing", () => {
  vi.stubEnv("APP_URL", undefined);
  expect(() => register()).toThrow("Missing environment variables: APP_URL");
});

it("the app refuses to start with an empty variable", () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("EMAIL_FROM", "");
  expect(() => register()).toThrow("Missing environment variables: DATABASE_URL, EMAIL_FROM");
});

it("production refuses to start without the email provider settings", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("EMAIL_API_KEY", "re_test");
  vi.stubEnv("EMAIL_WEBHOOK_SECRET", undefined);
  expect(() => register()).toThrow("Missing environment variables: EMAIL_WEBHOOK_SECRET");
});