import { eq } from "drizzle-orm";
import * as v from "valibot";
import { afterEach, beforeEach, expect, it, type MockInstance, vi } from "vitest";
import { createMember } from "../test/factories";
import { ApiError } from "./api-error";
import { apiRoute } from "./api-route";
import { db } from "./db";
import { members } from "./schema";
import { createSession } from "./sessions";

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
  const response = await apiRoute(
    "public",
    handler,
  )(
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
  const response = await apiRoute(
    "public",
    handler,
  )(new Request(`${appOrigin}/api/issues`, { method: "POST", headers: { "Sec-Fetch-Site": "cross-site" } }));
  expect(response.status).toBe(403);
  expect(handler).not.toHaveBeenCalled();
});

it("SEC-004: a write with neither Origin nor Sec-Fetch-Site is rejected with 403", async () => {
  const handler = vi.fn(ok);
  const response = await apiRoute(
    "public",
    handler,
  )(new Request(`${appOrigin}/api/issues`, { method: "PATCH" }));
  expect(response.status).toBe(403);
  expect(handler).not.toHaveBeenCalled();
});

it("SEC-004: a write whose Origin matches APP_URL reaches the handler", async () => {
  const handler = vi.fn(ok);
  const response = await apiRoute(
    "public",
    handler,
  )(new Request(`${appOrigin}/api/issues`, { method: "PUT", headers: { Origin: appOrigin } }));
  expect(response.status).toBe(204);
  expect(handler).toHaveBeenCalledOnce();
});

it("SEC-004: a write with no Origin but Sec-Fetch-Site same-origin reaches the handler", async () => {
  const handler = vi.fn(ok);
  const response = await apiRoute(
    "public",
    handler,
  )(new Request(`${appOrigin}/api/issues`, { method: "POST", headers: { "Sec-Fetch-Site": "same-origin" } }));
  expect(response.status).toBe(204);
  expect(handler).toHaveBeenCalledOnce();
});

it("SEC-004: a cross-site GET is not blocked", async () => {
  const handler = vi.fn(ok);
  const response = await apiRoute(
    "public",
    handler,
  )(
    new Request(`${appOrigin}/api/issues`, {
      headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
    }),
  );
  expect(response.status).toBe(204);
  expect(handler).toHaveBeenCalledOnce();
});

it("an ApiError maps to its status and { error: { message, fields } }", async () => {
  const response = await apiRoute("public", () => {
    throw new ApiError(422, "Check the highlighted fields", { title: "Title required" });
  })(new Request(`${appOrigin}/api/issues`, { method: "POST", headers: { Origin: appOrigin } }));
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: { message: "Check the highlighted fields", fields: { title: "Title required" } },
  });
});

it("an ApiError without fields has no fields key in the body", async () => {
  const response = await apiRoute("public", () => {
    throw new ApiError(404, "Not found");
  })(new Request(`${appOrigin}/api/issues/WEB-999`));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: { message: "Not found" } });
});

it("any other thrown error maps to 500 with a generic message", async () => {
  const response = await apiRoute("public", () => {
    throw new TypeError("column secret_stuff does not exist");
  })(new Request(`${appOrigin}/api/issues`));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: { message: "Something went wrong." } });
});

it("SEC-007: each request writes one log line with method, path, status and duration", async () => {
  await apiRoute(
    "public",
    ok,
  )(new Request(`${appOrigin}/api/issues`, { method: "POST", headers: { Origin: appOrigin } }));
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
  await apiRoute(
    "public",
    ok,
  )(
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
  await apiRoute("public", () => {
    throw new TypeError("boom");
  })(new Request(`${appOrigin}/api/issues`));
  expect(loggedLines()).toEqual([
    expect.objectContaining({ level: "error", status: 500, error: "TypeError: boom" }),
  ]);
});

async function signedInRequest(role: "admin" | "member", body?: unknown) {
  const member = await createMember({ role });
  const token = await createSession(member.id);
  const request = new Request(`${appOrigin}/api/projects/WEB`, {
    method: "DELETE",
    headers: { Origin: appOrigin, Cookie: `session=${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { member, request };
}

it("SEC-006.1: a member's request to an admin-only route gets 403 and the handler never runs", async () => {
  const handler = vi.fn(ok);
  const { request } = await signedInRequest("member");
  const response = await apiRoute("admin", handler)(request);
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: { message: "You don't have permission to do that." } });
  expect(handler).not.toHaveBeenCalled();
});

it("SEC-006: an admin's request reaches the admin-only handler with the member", async () => {
  const handler = vi.fn(ok);
  const { member, request } = await signedInRequest("admin");
  const response = await apiRoute("admin", handler)(request);
  expect(response.status).toBe(204);
  expect(handler).toHaveBeenCalledWith(request, expect.objectContaining({ id: member.id, role: "admin" }));
});

it("REQ-052: a role removed after sign-in applies on the next request", async () => {
  const handler = vi.fn(ok);
  const { member, request } = await signedInRequest("admin");
  await db.update(members).set({ role: "member" }).where(eq(members.id, member.id));
  const response = await apiRoute("admin", handler)(request);
  expect(response.status).toBe(403);
  expect(handler).not.toHaveBeenCalled();
});

const NewThing = v.object({
  name: v.pipe(
    v.string("Name required"),
    v.trim(),
    v.nonEmpty("Name required"),
    v.regex(/^[a-z ]+$/i, "Letters only"),
  ),
  key: v.pipe(
    v.string("Key must be 2 to 5 letters"),
    v.minLength(2, "Key must be 2 to 5 letters"),
    v.regex(/^[a-z]+$/i, "Letters only"),
    v.toUpperCase(),
  ),
});

function postWith(body: string) {
  return new Request(`${appOrigin}/api/things`, { method: "POST", headers: { Origin: appOrigin }, body });
}

it("a body that isn't valid JSON gets 422 \"Couldn't read the request.\" with no fields", async () => {
  const handler = vi.fn(ok);
  const response = await apiRoute("public", NewThing, handler)(postWith("{ name: "));
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ error: { message: "Couldn't read the request." } });
  expect(handler).not.toHaveBeenCalled();
});

it("a JSON body that isn't an object gets 422 \"Couldn't read the request.\"", async () => {
  const handler = vi.fn(ok);
  for (const body of ["[]", "null", '"text"']) {
    const response = await apiRoute("public", NewThing, handler)(postWith(body));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: { message: "Couldn't read the request." } });
  }
  expect(handler).not.toHaveBeenCalled();
});

it("STD-3: a schema failure gets 422 with the first message for each failing field", async () => {
  const handler = vi.fn(ok);
  const response = await apiRoute(
    "public",
    NewThing,
    handler,
  )(postWith(JSON.stringify({ name: "  ", key: "1" })));
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      message: "Check the highlighted fields",
      fields: { name: "Name required", key: "Key must be 2 to 5 letters" },
    },
  });
  expect(handler).not.toHaveBeenCalled();
});

it("the handler receives the schema's output", async () => {
  const handler = vi.fn(ok);
  const request = postWith(JSON.stringify({ name: "  Website ", key: "web", extra: "dropped" }));
  const response = await apiRoute("public", NewThing, handler)(request);
  expect(response.status).toBe(204);
  expect(handler).toHaveBeenCalledWith(request, { name: "Website", key: "WEB" });
});

it("STD-1: a signed-out request with an invalid body gets 401", async () => {
  const handler = vi.fn(ok);
  const response = await apiRoute("member", NewThing, handler)(postWith(JSON.stringify({ name: "" })));
  expect(response.status).toBe(401);
  expect(handler).not.toHaveBeenCalled();
});

it("SEC-004: a cross-site write with an invalid body gets 403", async () => {
  const handler = vi.fn(ok);
  const response = await apiRoute(
    "public",
    NewThing,
    handler,
  )(
    new Request(`${appOrigin}/api/things`, {
      method: "POST",
      headers: { Origin: "https://evil.example" },
      body: "{ name: ",
    }),
  );
  expect(response.status).toBe(403);
  expect(handler).not.toHaveBeenCalled();
});

it("SEC-007: a validation 422 is logged at info level without the body", async () => {
  await apiRoute("public", NewThing, ok)(postWith(JSON.stringify({ name: "body-secret", key: "1" })));
  const [line] = log.mock.calls.map(([raw]) => raw as string);
  expect(JSON.parse(line)).toMatchObject({ level: "info", method: "POST", path: "/api/things", status: 422 });
  expect(line).not.toContain("body-secret");
});

it("a route without a schema can still read the body itself", async () => {
  const response = await apiRoute("public", async (request) => Response.json(await request.json()))(
    postWith(JSON.stringify({ name: "Website" })),
  );
  expect(await response.json()).toEqual({ name: "Website" });
});

it("a member's invalid body on an admin-only route gets 422, and a valid one gets 403", async () => {
  const handler = vi.fn(ok);
  const invalid = await signedInRequest("member", { name: "" });
  expect((await apiRoute("admin", NewThing, handler)(invalid.request)).status).toBe(422);
  const valid = await signedInRequest("member", { name: "Website", key: "WEB" });
  expect((await apiRoute("admin", NewThing, handler)(valid.request)).status).toBe(403);
  expect(handler).not.toHaveBeenCalled();
});