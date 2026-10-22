import { eq } from "drizzle-orm";
import * as v from "valibot";
import { afterEach, beforeEach, expect, it, type MockInstance, vi } from "vitest";
import { createMember } from "../../test/factories";
import { ApiError } from "./api-error";
import { apiRoute } from "./api-route";
import { db } from "./db";
import { members } from "./schema";
import { createSession } from "../identity";

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

it("SEC-004.1, SEC-004: a cross-site write, or one with neither Origin nor a same-origin Sec-Fetch-Site, gets 403 before the body is read, and the handler never runs", async () => {
  const handler = vi.fn(ok);
  const route = apiRoute("public", handler);
  const crossSiteDelete = await route(
    new Request(`${appOrigin}/api/issues/WEB-42`, {
      method: "DELETE",
      headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
    }),
  );

  expect(crossSiteDelete.status).toBe(403);
  expect(await crossSiteDelete.json()).toEqual({
    error: { message: "You don't have permission to do that." },
  });

  const others = [
    await route(
      new Request(`${appOrigin}/api/issues`, { method: "POST", headers: { "Sec-Fetch-Site": "cross-site" } }),
    ),
    await route(new Request(`${appOrigin}/api/issues`, { method: "PATCH" })),
    await apiRoute(
      "public",
      NewThing,
      handler,
    )(
      new Request(`${appOrigin}/api/things`, {
        method: "POST",
        headers: { Origin: "https://evil.example" },
        body: "{ name: ",
      }),
    ),
  ];

  expect(others.map((response) => response.status)).toEqual([403, 403, 403]);
  expect(handler).not.toHaveBeenCalled();
});

it("SEC-004: a write whose Origin matches APP_URL, a write with Sec-Fetch-Site same-origin, and a cross-site GET reach the handler", async () => {
  const handler = vi.fn(ok);
  const route = apiRoute("public", handler);

  const responses = [
    await route(new Request(`${appOrigin}/api/issues`, { method: "PUT", headers: { Origin: appOrigin } })),
    await route(
      new Request(`${appOrigin}/api/issues`, {
        method: "POST",
        headers: { "Sec-Fetch-Site": "same-origin" },
      }),
    ),
    await route(
      new Request(`${appOrigin}/api/issues`, {
        headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
      }),
    ),
  ];

  expect(responses.map((response) => response.status)).toEqual([204, 204, 204]);
  expect(handler).toHaveBeenCalledTimes(3);
});

it("an ApiError maps to its status and { error: { message, fields } }, with no fields key when it has none", async () => {
  const withFields = await apiRoute("public", () => {
    throw new ApiError(422, "Check the highlighted fields", { title: "Title required" });
  })(new Request(`${appOrigin}/api/issues`, { method: "POST", headers: { Origin: appOrigin } }));
  const withoutFields = await apiRoute("public", () => {
    throw new ApiError(404, "Not found");
  })(new Request(`${appOrigin}/api/issues/WEB-999`));

  expect(withFields.status).toBe(422);
  expect(await withFields.json()).toEqual({
    error: { message: "Check the highlighted fields", fields: { title: "Title required" } },
  });
  expect(withoutFields.status).toBe(404);
  expect(await withoutFields.json()).toEqual({ error: { message: "Not found" } });
});

it("SEC-007: any other thrown error maps to 500 with a generic message, logged at error level with the error class only", async () => {
  const response = await apiRoute("public", () => {
    throw new TypeError("column secret_stuff does not exist");
  })(new Request(`${appOrigin}/api/issues`));

  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: { message: "Something went wrong." } });
  expect(loggedLines()).toEqual([
    expect.objectContaining({ level: "error", status: 500, error: "TypeError" }),
  ]);
  expect(JSON.stringify(loggedLines())).not.toContain("secret_stuff");
});

it("SEC-007: each request writes one log line of exactly method, path, status, duration and time, leaving out the query string, body, headers and cookies", async () => {
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

  const lines = log.mock.calls.map(([raw]) => raw as string);
  expect(lines).toHaveLength(1);
  const [line] = lines;
  expect(JSON.parse(line)).toMatchObject({
    level: "info",
    event: "request",
    method: "POST",
    path: "/api/password-resets",
    status: 204,
  });
  expect(typeof JSON.parse(line).durationMs).toBe("number");
  expect(Number.isNaN(Date.parse(JSON.parse(line).time))).toBe(false);
  for (const secret of ["query-secret", "cookie-secret", "header-secret", "body-secret", "correct horse"]) {
    expect(line).not.toContain(secret);
  }
  expect(Object.keys(JSON.parse(line)).sort()).toEqual(
    ["durationMs", "event", "level", "method", "path", "status", "time"].sort(),
  );
});

it("SEC-007: a failed database query's 500 log line has no query values", async () => {
  const secret = `secret-${Date.now()}@example.test`;
  await createMember({ email: secret });

  await apiRoute("public", async () => {
    await createMember({ email: secret });
    return ok();
  })(new Request(`${appOrigin}/api/issues`));

  const [line] = log.mock.calls.map(([raw]) => raw as string);
  expect(line).not.toContain(secret);
  expect(JSON.parse(line)).toEqual(
    expect.objectContaining({ status: 500, error: "DrizzleQueryError (PostgresError 23505)" }),
  );
});

async function signedInRequest(role: "admin" | "member", body?: unknown) {
  const member = await createMember({ role });
  const token = await createSession(member.id);
  const request = new Request(`${appOrigin}/api/projects/WEB`, {
    method: "DELETE",
    headers: { Origin: appOrigin, Cookie: `session=${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { member, token, request };
}

it("REQ-052: the handler gets the member's role as stored now, not as at sign-in", async () => {
  const handler = vi.fn(ok);
  const { member, request } = await signedInRequest("admin");
  await db.update(members).set({ role: "member" }).where(eq(members.id, member.id));
  const response = await apiRoute("member", handler)(request);
  expect(response.status).toBe(204);
  expect(handler).toHaveBeenCalledWith(request, expect.objectContaining({ id: member.id, role: "member" }));
});

it("SEC-007: a signed-in request's log line names the actor by username only; a signed-out request's 401 has no actor", async () => {
  const { member, token, request } = await signedInRequest("member");
  await apiRoute("member", ok)(request);
  const [line] = log.mock.calls.map(([raw]) => raw as string);
  expect(JSON.parse(line).actor).toBe(member.username);
  for (const secret of [member.id, member.email, member.fullName, token]) {
    expect(line).not.toContain(secret);
  }

  log.mockClear();
  const response = await apiRoute("member", ok)(new Request(`${appOrigin}/api/projects`));

  expect(response.status).toBe(401);
  expect(loggedLines()).toEqual([expect.not.objectContaining({ actor: expect.anything() })]);
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

it("a body that isn't valid JSON, or JSON that isn't an object, gets 422 \"Couldn't read the request.\" with no fields", async () => {
  const handler = vi.fn(ok);
  for (const body of ["{ name: ", "[]", "null", '"text"']) {
    const response = await apiRoute("public", NewThing, handler)(postWith(body));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: { message: "Couldn't read the request." } });
  }
  expect(handler).not.toHaveBeenCalled();
});

it("STD-3, SEC-007: a schema failure gets 422 with the first message for each failing field, a whole-body check gets its message and no fields, and the 422 is logged at info level without the body", async () => {
  const handler = vi.fn(ok);
  const OneChange = v.pipe(
    v.looseObject({}),
    v.check((body) => Object.keys(body).length === 1, "Change one field at a time"),
  );

  const fieldFailure = await apiRoute(
    "public",
    NewThing,
    handler,
  )(postWith(JSON.stringify({ name: "  ", key: "1" })));
  const wholeBodyFailure = await apiRoute(
    "public",
    OneChange,
    handler,
  )(postWith(JSON.stringify({ title: "New", priority: "high" })));
  log.mockClear();
  await apiRoute("public", NewThing, ok)(postWith(JSON.stringify({ name: "body-secret", key: "1" })));

  expect(fieldFailure.status).toBe(422);
  expect(await fieldFailure.json()).toEqual({
    error: {
      message: "Check the highlighted fields",
      fields: { name: "Name required", key: "Key must be 2 to 5 letters" },
    },
  });
  expect(wholeBodyFailure.status).toBe(422);
  expect(await wholeBodyFailure.json()).toEqual({ error: { message: "Change one field at a time" } });
  expect(handler).not.toHaveBeenCalled();
  const [line] = log.mock.calls.map(([raw]) => raw as string);
  expect(JSON.parse(line)).toMatchObject({ level: "info", method: "POST", path: "/api/things", status: 422 });
  expect(line).not.toContain("body-secret");
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

it("a route without a schema can still read the body itself", async () => {
  const response = await apiRoute("public", async (request) => Response.json(await request.json()))(
    postWith(JSON.stringify({ name: "Website" })),
  );
  expect(await response.json()).toEqual({ name: "Website" });
});