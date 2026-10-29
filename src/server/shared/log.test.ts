import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { logError, logInfo } from "./log";
import { spyOnLoggedErrors } from "../../test/log";

afterEach(() => {
  vi.restoreAllMocks();
});

function postgresError(code: string) {
  return Object.assign(new Error("duplicate key value violates unique constraint"), {
    name: "PostgresError",
    code,
  });
}

it("§4.8: an error line's keys come in the order level, time, source, event, context, error", () => {
  const loggedErrors = spyOnLoggedErrors();

  logError("worker", "delivery-failed", new Error("boom"), { deliveryId: "d1", channel: "email" });

  const [line] = loggedErrors();
  expect(Object.keys(line)).toEqual(["level", "time", "source", "event", "deliveryId", "channel", "error"]);
  expect(line).toMatchObject({ level: "error", source: "worker", event: "delivery-failed" });
  expect(Number.isNaN(Date.parse(line.time))).toBe(false);
});

it("§4.8: an info line goes through the same writer with no error and is not among the logged errors", () => {
  const write = vi.spyOn(console, "error").mockImplementation(() => {});

  logInfo("mail", "ignored", {});

  const [[raw]] = write.mock.calls;
  expect(Object.keys(JSON.parse(String(raw)))).toEqual(["level", "time", "source", "event"]);
  expect(JSON.parse(String(raw))).toMatchObject({ level: "info", source: "mail", event: "ignored" });
});

it("SEC-007.3: a failed query's line keeps the PostgreSQL error code but not the SQL, its parameters or the comment text", () => {
  const loggedErrors = spyOnLoggedErrors();
  const error = new DrizzleQueryError(
    'insert into "comments" ("body") values ($1)',
    ["Sam's secret comment text"],
    postgresError("23505"),
  );

  logError("worker", "pass-failed", error);

  const [line] = loggedErrors();
  expect(line.error).toMatchObject({
    name: "Error",
    message: "query failed",
    cause: { name: "PostgresError", code: "23505" },
  });
  expect(JSON.stringify(line)).not.toContain("secret comment");
  expect(JSON.stringify(line)).not.toContain("insert into");
});

it("SEC-007.4: an email address in an error's message, stack or cause shows as [email]", () => {
  const loggedErrors = spyOnLoggedErrors();
  const error = new Error("no mailbox for sam@example.com", {
    cause: new Error("rejected sam.lee+x@mail.example.co.uk"),
  });

  logError("worker", "pass-failed", error);

  const [line] = loggedErrors();
  expect(line.error.message).toBe("no mailbox for [email]");
  expect(line.error.cause.message).toBe("rejected [email]");
  expect(JSON.stringify(line)).not.toContain("@");
});

it("SEC-007.5: an error's 2,000-character message is cut to its first 500, in the stack as well", () => {
  const loggedErrors = spyOnLoggedErrors();
  const message = "a".repeat(500) + "b".repeat(1500);

  logError("worker", "pass-failed", new Error(message));

  const [line] = loggedErrors();
  expect(line.error.message).toBe("a".repeat(500));
  expect(line.error.stack).not.toContain("ab");
});

it("SEC-007.6: an error's extra properties are left out; only name, message, code, stack and causes, 2 levels deep", () => {
  const loggedErrors = spyOnLoggedErrors();
  const innermost = new Error("level 3");
  const error = Object.assign(
    new Error("level 0", {
      cause: new Error("level 1", { cause: new Error("level 2", { cause: innermost }) }),
    }),
    { code: "E_SEND", request: { body: "request-secret" }, status: 500 },
  );

  logError("worker", "pass-failed", error);

  const [line] = loggedErrors();
  expect(Object.keys(line.error)).toEqual(["name", "message", "code", "stack", "cause"]);
  expect(line.error.cause.message).toBe("level 1");
  expect(line.error.cause.cause.message).toBe("level 2");
  expect(line.error.cause.cause.cause).toBeUndefined();
  expect(JSON.stringify(line)).not.toContain("request-secret");
});

it("§4.8: a code that isn't a string or number is left out", () => {
  const loggedErrors = spyOnLoggedErrors();

  logError("worker", "pass-failed", Object.assign(new Error("x"), { code: { secret: "nested" } }));

  expect(loggedErrors()[0].error).not.toHaveProperty("code");
});

it("§4.8: a thrown string becomes an error named Error with that message", () => {
  const loggedErrors = spyOnLoggedErrors();

  logError("boot", "start-failed", "cannot reach sam@example.com", { script: "worker" });

  expect(loggedErrors()[0].error).toEqual({ name: "Error", message: "cannot reach [email]" });
});

it("§4.8, SEC-007.6: a thrown plain object keeps only its name, message and code", () => {
  const loggedErrors = spyOnLoggedErrors();

  logError("worker", "pass-failed", { message: "bad thing", code: 42, password: "hunter2" });

  expect(loggedErrors()[0].error).toEqual({ name: "Error", message: "bad thing", code: 42 });
});