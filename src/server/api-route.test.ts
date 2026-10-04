import { afterEach, beforeEach, expect, it, type MockInstance, vi } from "vitest";
import { ApiError } from "./api-error";
import { apiRoute } from "./api-route";

const appOrigin = "http://localhost:3000";
let log: MockInstance<typeof console.log>;

beforeEach(() => {
  log = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function loggedLines() {
  return log.mock.calls.map(([line]) => JSON.parse(line as string));
}

const ok = () => new Response(null, { status: 204 });

it("SEC-004.1: a cross-site form post to delete WEB-42 is rejected with 403 and the handler never runs", async () => {
  const handler = vi.fn(ok);
  const response = await apiRoute(handler)(
    new Request(`${appOrigin}/api/issues/WEB-42`, {
      method: "DELETE",
      headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
    }),
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: { message: "You don't have permission to do that." } });
  expect(handler).not.toHaveBeenCalled();
});

it("SEC-004: a write with no Origin and Sec-Fetch-Site cross-site is rejected with 403", async () => {
  const handler = vi.fn(ok);
  const response = await apiRoute(handler)(
    new Request(`${appOrigin}/api/issues`, { method: "POST", headers: { "Sec-Fetch-Site": "cross-site" } }),
  );
  expect(response.status).toBe(403);
  expect(handler).not.toHaveBeenCalled();
});

it("SEC-004: a write with neither Origin nor Sec-Fetch-Site is rejected with 403", async () => {
  const handler = vi.fn(ok);
  const response = await apiRoute(handler)(new Request(`${appOrigin}/api/issues`, { method: "PATCH" }));
  expect(response.status).toBe(403);
  expect(handler).not.toHaveBeenCalled();
});

it("SEC-004: a write whose Origin matches APP_URL reaches the handler", async () => {
  const handler = vi.fn(ok);
  const response = await apiRoute(handler)(
    new Request(`${appOrigin}/api/issues`, { method: "PUT", headers: { Origin: appOrigin } }),
  );
  expect(response.status).toBe(204);
  expect(handler).toHaveBeenCalledOnce();
});

it("SEC-004: a write with no Origin but Sec-Fetch-Site same-origin reaches the handler", async () => {
  const handler = vi.fn(ok);
  const response = await apiRoute(handler)(
    new Request(`${appOrigin}/api/issues`, { method: "POST", headers: { "Sec-Fetch-Site": "same-origin" } }),
  );
  expect(response.status).toBe(204);
  expect(handler).toHaveBeenCalledOnce();
});

it("SEC-004: a cross-site GET is not blocked", async () => {
  const handler = vi.fn(ok);
  const response = await apiRoute(handler)(
    new Request(`${appOrigin}/api/issues`, {
      headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
    }),
  );
  expect(response.status).toBe(204);
  expect(handler).toHaveBeenCalledOnce();
});

it("an ApiError maps to its status and { error: { message, fields } }", async () => {
  const response = await apiRoute(() => {
    throw new ApiError(422, "Check the highlighted fields", { title: "Title required" });
  })(new Request(`${appOrigin}/api/issues`, { method: "POST", headers: { Origin: appOrigin } }));
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: { message: "Check the highlighted fields", fields: { title: "Title required" } },
  });
});

it("an ApiError without fields has no fields key in the body", async () => {
  const response = await apiRoute(() => {
    throw new ApiError(404, "Not found");
  })(new Request(`${appOrigin}/api/issues/WEB-999`));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: { message: "Not found" } });
});

it("any other thrown error maps to 500 with a generic message", async () => {
  const response = await apiRoute(() => {
    throw new TypeError("column secret_stuff does not exist");
  })(new Request(`${appOrigin}/api/issues`));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: { message: "Something went wrong." } });
});

it("SEC-007: each request writes one log line with method, path, status and duration", async () => {
  await apiRoute(ok)(
    new Request(`${appOrigin}/api/issues`, { method: "POST", headers: { Origin: appOrigin } }),
  );
  const lines = loggedLines();
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({
    level: "info",
    event: "request",
    method: "POST",
    path: "/api/issues",
    status: 204,
  });
  expect(typeof lines[0].durationMs).toBe("number");
  expect(Number.isNaN(Date.parse(lines[0].time))).toBe(false);
});

it("SEC-007: the log line leaves out the query string, body, headers and cookies", async () => {
  await apiRoute(ok)(
    new Request(`${appOrigin}/api/password-resets?token=query-secret`, {
      method: "POST",
      headers: {
        Origin: appOrigin,
        Cookie: "session=cookie-secret",
        Authorization: "Bearer header-secret",
      },
      body: JSON.stringify({ token: "body-secret", password: "correct horse battery" }),
    }),
  );
  const [line] = log.mock.calls.map(([raw]) => raw as string);
  expect(JSON.parse(line).path).toBe("/api/password-resets");
  for (const secret of ["query-secret", "cookie-secret", "header-secret", "body-secret", "correct horse"]) {
    expect(line).not.toContain(secret);
  }
  expect(Object.keys(JSON.parse(line)).sort()).toEqual(
    ["durationMs", "event", "level", "method", "path", "status", "time"].sort(),
  );
});

it("SEC-007: a 500 is logged at error level with the error class", async () => {
  await apiRoute(() => {
    throw new TypeError("boom");
  })(new Request(`${appOrigin}/api/issues`));
  expect(loggedLines()).toEqual([
    expect.objectContaining({ level: "error", status: 500, error: "TypeError: boom" }),
  ]);
});