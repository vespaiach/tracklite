import { refresh } from "next/cache";
import * as v from "valibot";
import { afterEach, beforeEach, expect, it, type MockInstance, vi } from "vitest";
import { DomainError, type DomainErrorKind } from "../../domain/shared/domain-error";
import { createSession, sessionCookieName } from "../../infrastructure/identity/session";
import { sessions } from "../../infrastructure/identity/tables";
import { createMember } from "../../test/factories";
import { setNextRequest, writtenCookies } from "../../test/next-request";
import { moveIntoPast } from "../../test/time";
import { db } from "../../infrastructure/db";
import { eq } from "drizzle-orm";
import { hashToken } from "../../infrastructure/tokens";
import { action } from "./action";

let log: MockInstance<typeof console.error>;

beforeEach(() => {
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function loggedLines() {
  return log.mock.calls.map(([line]) => JSON.parse(line as string));
}

const NewThing = v.object({
  name: v.pipe(v.string("Name required"), v.trim(), v.nonEmpty("Name required")),
  key: v.pipe(v.string("Key must be 2 to 5 letters"), v.regex(/^[a-z]{2,5}$/i, "Key must be 2 to 5 letters")),
});

async function signIn() {
  const member = await createMember();
  const token = await createSession(member.id);
  setNextRequest({ cookies: { [sessionCookieName()]: token } });
  return { member, token };
}

it("STD-1, REQ-007.4: a member action called signed out returns signedOut, runs nothing and logs no actor", async () => {
  const run = vi.fn();

  const result = await action("createThing", "member", NewThing, run)({ name: "Website", key: "WEB" });

  expect(result).toEqual({ ok: false, error: { kind: "signedOut", message: "Sign in to continue." } });
  expect(run).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
  expect(loggedLines()).toEqual([
    expect.objectContaining({ level: "info", source: "action", event: "call", outcome: "signedOut" }),
  ]);
  expect(loggedLines()[0]).not.toHaveProperty("actor");
});

it("STD-1, REQ-006, SEC-007: a signed-in call runs the use case with the member and the parsed FormData, refreshes, renews an hour-idle session and logs one action/call line naming only the actor", async () => {
  const { member, token } = await signIn();
  const [{ id }] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)));
  await moveIntoPast(sessions.lastActiveAt, id, "2 hours");
  const run = vi.fn(async () => ({ id: "WEB-1" }));
  const form = new FormData();
  form.set("name", "  Website ");
  form.set("key", "web");

  const result = await action("createThing", "member", NewThing, run)(form);

  expect(result).toEqual({ ok: true, data: { id: "WEB-1" } });
  expect(run).toHaveBeenCalledWith(expect.objectContaining({ id: member.id }), {
    name: "Website",
    key: "web",
  });
  expect(refresh).toHaveBeenCalledOnce();
  expect(writtenCookies()).toEqual([
    {
      name: sessionCookieName(),
      value: token,
      options: expect.objectContaining({ maxAge: 30 * 24 * 60 * 60, httpOnly: true, sameSite: "lax" }),
    },
  ]);
  const [line] = log.mock.calls.map(([raw]) => raw as string);
  expect(Object.keys(JSON.parse(line))).toEqual([
    "level",
    "time",
    "source",
    "event",
    "action",
    "outcome",
    "durationMs",
    "actor",
  ]);
  expect(JSON.parse(line)).toMatchObject({ action: "createThing", outcome: "ok", actor: member.username });
  for (const secret of [token, "Website", member.email]) expect(line).not.toContain(secret);
});

it("STD-3: invalid input returns invalid with the first message per field, Required for a missing one, without running the use case", async () => {
  await signIn();
  const run = vi.fn();

  const result = await action("createThing", "member", NewThing, run)({ name: "  " });

  expect(result).toEqual({
    ok: false,
    error: {
      kind: "invalid",
      message: "Check the highlighted fields",
      fields: { name: "Name required", key: "Required" },
    },
  });
  expect(run).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
  expect(loggedLines()).toEqual([expect.objectContaining({ level: "info", outcome: "invalid" })]);
});

it("STD-2, STD-4, STD-6, STD-8: each DomainError kind comes back with its kind, message and fields, without a refresh or an error line", async () => {
  const kinds: DomainErrorKind[] = [
    "signedOut",
    "forbidden",
    "notFound",
    "conflict",
    "expired",
    "invalid",
    "limited",
    "unavailable",
  ];

  for (const kind of kinds) {
    const refused = action("refuse", "public", v.unknown(), async () => {
      throw new DomainError(kind, `A ${kind} outcome`);
    });
    expect(await refused(undefined)).toEqual({ ok: false, error: { kind, message: `A ${kind} outcome` } });
  }
  const withFields = action("refuse", "public", v.unknown(), async () => {
    throw new DomainError("invalid", "Check the highlighted fields", { title: "Title required" });
  });

  expect(await withFields(undefined)).toEqual({
    ok: false,
    error: { kind: "invalid", message: "Check the highlighted fields", fields: { title: "Title required" } },
  });
  expect(refresh).not.toHaveBeenCalled();
  expect(loggedLines().map((line) => [line.level, line.outcome])).toEqual([
    ...kinds.map((kind) => ["info", kind]),
    ["info", "invalid"],
  ]);
});

it("DEC-002, SEC-007.1: a public action runs signed out, with its parsed input and no actor unless it names one", async () => {
  const run = vi.fn(async () => "done");

  const result = await action("publicThing", "public", NewThing, run)({ name: "Website", key: "WEB" });

  expect(result).toEqual({ ok: true, data: "done" });
  expect(run).toHaveBeenCalledWith({ name: "Website", key: "WEB" }, expect.any(Function));
  expect(refresh).toHaveBeenCalledOnce();
  expect(loggedLines()[0]).not.toHaveProperty("actor");

  await action("signIn", "public", NewThing, async (_input, nameActor) => nameActor("sam"))({
    name: "Website",
    key: "WEB",
  });

  expect(loggedLines()[1]).toMatchObject({ action: "signIn", actor: "sam" });
});

it("OPS-007: an unknown error is rethrown, not refreshed, and logged as action/call with outcome error", async () => {
  const { member } = await signIn();
  const failure = new TypeError("column does not exist");

  const call = action("createThing", "member", NewThing, async () => {
    throw failure;
  })({ name: "Website", key: "WEB" });

  await expect(call).rejects.toBe(failure);
  expect(refresh).not.toHaveBeenCalled();
  expect(loggedLines()).toEqual([
    expect.objectContaining({
      level: "info",
      source: "action",
      event: "call",
      action: "createThing",
      outcome: "error",
      actor: member.username,
    }),
  ]);
});