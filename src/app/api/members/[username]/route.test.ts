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

it("REQ-007.1, REQ-007.4: deactivating Sam ends every session, so the next page load is signed out and a save mid-edit gets 401 with nothing saved", async () => {
  const { cookie: adminCookie } = await signedIn("admin");
  const { member: sam, cookie: samCookie } = await signedIn("member", { fullName: "Sam Lee" });
  await createSession(sam.id);

  const response = await patchMember(adminCookie, sam.username, { deactivated: true });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ username: sam.username, deactivated: true });
  expect((await getMeWith(samCookie)).status).toBe(401);
  expect(await db.select().from(sessions).where(eq(sessions.memberId, sam.id))).toEqual([]);

  const save = await patchMe(
    jsonRequest("PATCH", "/api/me", { fullName: "Sam Rivera" }, { Cookie: samCookie }),
  );

  expect(save.status).toBe(401);
  expect((await storedMember(sam.id)).fullName).toBe("Sam Lee");
});

it('REQ-007.1, REQ-007.5: a deactivated member\'s correct password gets "Incorrect email or password.", a reset request sends nothing, and an earlier reset link has expired', async () => {
  const { cookie: adminCookie } = await signedIn("admin");
  const { member: sam } = await signedIn("member");
  const token = await resetTokenFor(sam.email);
  outbox.sent = [];

  await patchMember(adminCookie, sam.username, { deactivated: true });

  const signedInAgain = await signInWith(sam.email);
  expect(signedInAgain.status).toBe(422);
  expect(await signedInAgain.json()).toEqual({ error: { message: "Incorrect email or password." } });

  expect((await requestResetLink(sam.email)).status).toBe(204);
  expect(outbox.sent).toEqual([]);

  const reset = await resetPassword(
    jsonRequest("POST", "/api/password-resets", { token, password: "a brand new password" }),
  );
  expect(reset.status).toBe(410);
  expect(await reset.json()).toEqual({ error: { message: "This link has expired" } });
  expect(reset.headers.get("set-cookie")).toBeNull();
  expect((await storedMember(sam.id)).passwordHash).toBe(passwordHash);
});

it("REQ-007.3: the only admin can't deactivate themselves or remove their own admin role", async () => {
  const { member: alex, cookie } = await signedIn("admin");
  await makeOnlyAdmins(alex);

  for (const body of [{ deactivated: true }, { role: "member" }]) {
    const response = await patchMember(cookie, alex.username, body);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual(lastAdmin);
  }
  expect(await storedMember(alex.id)).toMatchObject({ role: "admin", deactivatedAt: null });
  expect((await getMeWith(cookie)).status).toBe(200);
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

it("REQ-052.1, §3.1: a member made admin, with the username matched ignoring capitals, is an admin from their next request", async () => {
  const { cookie: adminCookie } = await signedIn("admin");
  const { member: sam, cookie: samCookie } = await signedIn("member");

  const response = await patchMember(adminCookie, sam.username.toUpperCase(), { role: "admin" });

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

it("STD-3: an admin setting a role other than admin or member, or deactivated to something other than true or false, gets 422 with the field error and changes nothing", async () => {
  const { cookie } = await signedIn("admin");
  const { member: sam } = await signedIn("member");

  for (const [body, fields] of [
    [{ role: "owner" }, { role: "Choose admin or member" }],
    [{ deactivated: "yes" }, { deactivated: "Choose true or false" }],
  ]) {
    const response = await patchMember(cookie, sam.username, body);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: { message: "Check the highlighted fields", fields } });
  }
  expect(await storedMember(sam.id)).toMatchObject({ role: "member", deactivatedAt: null });
});

it('§3.2: an unknown username gets 404 "Not found"', async () => {
  const { cookie } = await signedIn("admin");

  const response = await patchMember(cookie, "nobody-here", { deactivated: true });

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: { message: "Not found" } });
});