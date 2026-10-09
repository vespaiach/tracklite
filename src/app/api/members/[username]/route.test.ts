import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../server/db";
import { outbox } from "../../../../server/email/outbox";
import { hashPassword } from "../../../../server/passwords";
import { members, sessions } from "../../../../server/schema";
import { createSession, type Member } from "../../../../server/sessions";
import { createMember } from "../../../../test/factories";
import { jsonRequest, requestResetLink, resetTokenFor } from "../../../../test/reset-links";
import { GET as getMe, PATCH as patchMe } from "../../me/route";
import { POST as resetPassword } from "../../password-resets/route";
import { POST as signIn } from "../../sessions/route";
import { PATCH } from "./route";

const password = "correct horse battery";
let passwordHash: string;

beforeEach(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  outbox.sent = [];
  outbox.failing = false;
  passwordHash ??= await hashPassword(password);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function signedIn(role: "admin" | "member", overrides: Partial<Member> = {}) {
  const member = await createMember({ role, passwordHash, ...overrides });
  return { member, cookie: `session=${await createSession(member.id)}` };
}

function patchMember(cookie: string, username: string, body: unknown) {
  return PATCH(jsonRequest("PATCH", `/api/members/${username}`, body, { Cookie: cookie }), {
    params: Promise.resolve({ username }),
  });
}

function getMeWith(cookie: string) {
  return getMe(new Request("http://localhost:3000/api/me", { headers: { Cookie: cookie } }));
}

function signInWith(email: string, withPassword = password) {
  return signIn(jsonRequest("POST", "/api/sessions", { email, password: withPassword }));
}

async function storedMember(id: string) {
  const [member] = await db.select().from(members).where(eq(members.id, id));
  return member;
}

async function makeOnlyAdmins(...admins: Member[]) {
  await db
    .update(members)
    .set({ role: "member" })
    .where(
      and(
        eq(members.role, "admin"),
        isNull(members.deactivatedAt),
        notInArray(
          members.id,
          admins.map((admin) => admin.id),
        ),
      ),
    );
}

function activeAdmins(executor: Pick<typeof db, "select"> = db) {
  return executor
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.role, "admin"), isNull(members.deactivatedAt)));
}

async function waitForLockWaiters(count: number) {
  for (;;) {
    const [{ waiting }] = await db.execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if (waiting >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function whileAdminRowsLocked<T>(start: () => Promise<T>, lockWaiters: number) {
  let lockTaken!: () => void;
  let release!: () => void;
  const taken = new Promise<void>((resolve) => {
    lockTaken = resolve;
  });
  const holder = db.transaction(async (tx) => {
    await activeAdmins(tx).for("update");
    lockTaken();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  await taken;
  const started = start();
  await waitForLockWaiters(lockWaiters);
  release();
  await holder;
  return started;
}

const lastAdmin = { error: { message: "There must be at least one admin." } };
const noPermission = { error: { message: "You don't have permission to do that." } };

it("REQ-007.1: a deactivated member's next page load is signed out", async () => {
  const { cookie: adminCookie } = await signedIn("admin");
  const { member: sam, cookie: samCookie } = await signedIn("member");
  await createSession(sam.id);

  const response = await patchMember(adminCookie, sam.username, { deactivated: true });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ username: sam.username, deactivated: true });
  expect((await getMeWith(samCookie)).status).toBe(401);
  expect(await db.select().from(sessions).where(eq(sessions.memberId, sam.id))).toEqual([]);
});

it('REQ-007.1: a deactivated member\'s correct password gets "Incorrect email or password."', async () => {
  const { cookie: adminCookie } = await signedIn("admin");
  const { member: sam } = await signedIn("member");

  await patchMember(adminCookie, sam.username, { deactivated: true });
  const response = await signInWith(sam.email);

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ error: { message: "Incorrect email or password." } });
});

it("REQ-007.1: a deactivated member's reset request sends nothing", async () => {
  const { cookie: adminCookie } = await signedIn("admin");
  const { member: sam } = await signedIn("member");

  await patchMember(adminCookie, sam.username, { deactivated: true });
  const response = await requestResetLink(sam.email);

  expect(response.status).toBe(204);
  expect(outbox.sent).toEqual([]);
});

it("REQ-007.3: the only admin can't deactivate themselves", async () => {
  const { member: alex, cookie } = await signedIn("admin");
  await makeOnlyAdmins(alex);

  const response = await patchMember(cookie, alex.username, { deactivated: true });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual(lastAdmin);
  expect(await storedMember(alex.id)).toMatchObject({ role: "admin", deactivatedAt: null });
  expect((await getMeWith(cookie)).status).toBe(200);
});

it("REQ-007.3: the only admin can't remove their own admin role", async () => {
  const { member: alex, cookie } = await signedIn("admin");
  await makeOnlyAdmins(alex);

  const response = await patchMember(cookie, alex.username, { role: "member" });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual(lastAdmin);
  expect((await storedMember(alex.id)).role).toBe("admin");
});

it("REQ-007.4: a member deactivated mid-edit gets 401 and nothing is saved", async () => {
  const { cookie: adminCookie } = await signedIn("admin");
  const { member: sam, cookie: samCookie } = await signedIn("member", { fullName: "Sam Lee" });

  await patchMember(adminCookie, sam.username, { deactivated: true });
  const save = await patchMe(
    jsonRequest("PATCH", "/api/me", { fullName: "Sam Rivera" }, { Cookie: samCookie }),
  );

  expect(save.status).toBe(401);
  expect((await storedMember(sam.id)).fullName).toBe("Sam Lee");
});

it('REQ-007.5: a reset link used after deactivation shows "This link has expired"', async () => {
  const { cookie: adminCookie } = await signedIn("admin");
  const { member: sam } = await signedIn("member");
  const token = await resetTokenFor(sam.email);

  await patchMember(adminCookie, sam.username, { deactivated: true });
  const response = await resetPassword(
    jsonRequest("POST", "/api/password-resets", { token, password: "a brand new password" }),
  );

  expect(response.status).toBe(410);
  expect(await response.json()).toEqual({ error: { message: "This link has expired" } });
  expect(response.headers.get("set-cookie")).toBeNull();
  expect((await storedMember(sam.id)).passwordHash).toBe(passwordHash);
});

it("REQ-008.1: a reactivated member signs in with their existing password and profile", async () => {
  const { cookie: adminCookie } = await signedIn("admin");
  const { member: sam } = await signedIn("member", { fullName: "Sam Lee" });
  await patchMember(adminCookie, sam.username, { deactivated: true });

  const response = await patchMember(adminCookie, sam.username, { deactivated: false });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ username: sam.username, deactivated: false });
  const signedInAgain = await signInWith(sam.email);
  expect(signedInAgain.status).toBe(204);
  const cookie = signedInAgain.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(await (await getMeWith(cookie)).json()).toMatchObject({
    username: sam.username,
    fullName: "Sam Lee",
    deactivated: false,
  });
});

it("REQ-052.1: a member made admin is an admin from their next request", async () => {
  const { cookie: adminCookie } = await signedIn("admin");
  const { member: sam, cookie: samCookie } = await signedIn("member");

  const response = await patchMember(adminCookie, sam.username, { role: "admin" });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ username: sam.username, role: "admin" });
  const me = await getMeWith(samCookie);
  expect(me.status).toBe(200);
  expect(await me.json()).toMatchObject({ role: "admin" });
});

it("REQ-052.2: a member whose admin role was removed gets 403 on their next admin save", async () => {
  const { cookie: adminCookie } = await signedIn("admin");
  const { member: jo, cookie: joCookie } = await signedIn("admin");
  const { member: sam } = await signedIn("member");

  expect((await patchMember(adminCookie, jo.username, { role: "member" })).status).toBe(200);
  const save = await patchMember(joCookie, sam.username, { role: "admin" });

  expect(save.status).toBe(403);
  expect(await save.json()).toEqual(noPermission);
  expect((await storedMember(sam.id)).role).toBe("member");
  expect((await getMeWith(joCookie)).status).toBe(200);
});

it("REQ-052.3: two admins removing each other's admin role at once leaves one admin", async () => {
  const { member: alex, cookie: alexCookie } = await signedIn("admin");
  const { member: jo, cookie: joCookie } = await signedIn("admin");
  await makeOnlyAdmins(alex, jo);

  const responses = await whileAdminRowsLocked(
    () =>
      Promise.all([
        patchMember(alexCookie, jo.username, { role: "member" }),
        patchMember(joCookie, alex.username, { role: "member" }),
      ]),
    2,
  );

  expect(responses.map((response) => response.status).sort()).toEqual([200, 422]);
  const refused = responses.find((response) => response.status === 422);
  expect(await refused?.json()).toEqual(lastAdmin);
  expect(await activeAdmins()).toHaveLength(1);
});

it("STD-2: a member can't change roles or deactivate", async () => {
  const { cookie } = await signedIn("member");
  const { member: sam } = await signedIn("member");

  for (const body of [{ role: "admin" }, { deactivated: true }]) {
    const response = await patchMember(cookie, sam.username, body);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(noPermission);
  }
  expect(await storedMember(sam.id)).toMatchObject({ role: "member", deactivatedAt: null });
});

it("STD-3: a member's malformed JSON on a member change gets 422 \"Couldn't read the request.\", not 500", async () => {
  const { cookie } = await signedIn("member");
  const { member: sam } = await signedIn("member");
  const request = new Request(`http://localhost:3000/api/members/${sam.username}`, {
    method: "PATCH",
    headers: { Origin: "http://localhost:3000", "Content-Type": "application/json", Cookie: cookie },
    body: "{ role: admin",
  });

  const response = await PATCH(request, { params: Promise.resolve({ username: sam.username }) });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ error: { message: "Couldn't read the request." } });
  expect(await storedMember(sam.id)).toMatchObject({ role: "member", deactivatedAt: null });
});

it('STD-3: an admin setting a role other than admin or member gets 422 "Choose admin or member"', async () => {
  const { cookie } = await signedIn("admin");
  const { member: sam } = await signedIn("member");

  const response = await patchMember(cookie, sam.username, { role: "owner" });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: { message: "Check the highlighted fields", fields: { role: "Choose admin or member" } },
  });
  expect((await storedMember(sam.id)).role).toBe("member");
});

it('STD-3: an admin setting deactivated to something other than true or false gets 422 "Choose true or false"', async () => {
  const { cookie } = await signedIn("admin");
  const { member: sam } = await signedIn("member");

  const response = await patchMember(cookie, sam.username, { deactivated: "yes" });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: { message: "Check the highlighted fields", fields: { deactivated: "Choose true or false" } },
  });
  expect((await storedMember(sam.id)).deactivatedAt).toBeNull();
});

it("§3.1: the username is matched ignoring capitals", async () => {
  const { cookie } = await signedIn("admin");
  const { member: sam } = await signedIn("member");

  const response = await patchMember(cookie, sam.username.toUpperCase(), { role: "admin" });

  expect(response.status).toBe(200);
  expect((await storedMember(sam.id)).role).toBe("admin");
});

it('§3.2: an unknown username gets 404 "Not found"', async () => {
  const { cookie } = await signedIn("admin");

  const response = await patchMember(cookie, "nobody-here", { deactivated: true });

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: { message: "Not found" } });
});

it.each([
  ["role", { role: "owner" }],
  ["deactivated", { deactivated: "yes" }],
])("STD-3: an invalid %s gets 422 with a field error and changes nothing", async (field, body) => {
  const { cookie } = await signedIn("admin");
  const { member: sam } = await signedIn("member");

  const response = await patchMember(cookie, sam.username, body);

  expect(response.status).toBe(422);
  expect(Object.keys((await response.json()).error.fields)).toEqual([field]);
  expect(await storedMember(sam.id)).toMatchObject({ role: "member", deactivatedAt: null });
});