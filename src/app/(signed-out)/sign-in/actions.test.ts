import { hash } from "@node-rs/argon2";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, type MockInstance, vi } from "vitest";
import { db } from "../../../infrastructure/db";
import { members, signInAttempts } from "../../../infrastructure/identity/tables";
import { hashPassword, verifyPassword } from "../../../infrastructure/passwords";
import { sessionCookieWritten } from "../../../test/actions";
import { createMember } from "../../../test/factories";
import { setNextRequest } from "../../../test/next-request";
import { uniqueIp } from "../../../test/reset-links";
import { GET as getIssue } from "../../api/[...path]/route";
import { GET as getMe } from "../../api/me/route";
import { signIn as signInAction } from "./actions";

const password = "correct horse battery";
let passwordHash: string;

let log: MockInstance<typeof console.error>;

beforeEach(async () => {
  log = vi.spyOn(console, "error").mockImplementation(() => {});
  passwordHash ??= await hashPassword(password);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function signIn(input: { email: string; password: string }, forwardedFor = uniqueIp()) {
  setNextRequest({ headers: { "x-forwarded-for": forwardedFor } });
  return signInAction(input);
}

async function signedInUsername(cookie: string | undefined) {
  const response = await getMe(
    new Request("http://localhost:3000/api/me", { headers: cookie ? { Cookie: cookie } : {} }),
  );
  return response.status === 200 ? ((await response.json()) as { username: string }).username : undefined;
}

const incorrect = { ok: false, error: { kind: "invalid", message: "Incorrect email or password." } };
const tooMany = { ok: false, error: { kind: "limited", message: "Too many attempts. Try again later." } };

async function expectRefused(result: Promise<unknown>, refusal: object) {
  expect(await result).toEqual(refusal);
  expect(sessionCookieWritten()).toBeUndefined();
}

async function storedHash(memberId: string) {
  const [member] = await db
    .select({ passwordHash: members.passwordHash })
    .from(members)
    .where(eq(members.id, memberId));
  return member.passwordHash;
}

const currentSettingsPrefix = "$argon2id$v=19$m=19456,t=2,p=1$";

async function hashWithOlderSettings(plain: string) {
  return hash(plain, { memoryCost: 8192, timeCost: 1, parallelism: 1 });
}

async function seedFailures(values: { email: string; ip: string }, count: number) {
  await db.insert(signInAttempts).values(Array.from({ length: count }, () => values));
}

it("REQ-047.1, REQ-047.4, §4.1: an active member with the right password is signed in, whatever the capitals in the email, and a current hash isn't rewritten", async () => {
  const sam = await createMember({ passwordHash });

  expect(await signIn({ email: sam.email.toUpperCase(), password })).toEqual({ ok: true, data: null });

  expect(await signedInUsername(sessionCookieWritten())).toBe(sam.username);
  expect(await storedHash(sam.id)).toBe(passwordHash);
});

it("SEC-007.1: Sam signs in → the log line names member sam, with no password or token", async () => {
  const sam = await createMember({ passwordHash });

  await signIn({ email: sam.email, password });

  const lines = log.mock.calls.map(([raw]) => raw as string);
  const [line] = lines.filter((raw) => JSON.parse(raw).source === "action");
  expect(JSON.parse(line)).toMatchObject({ event: "call", action: "signIn", actor: sam.username });
  for (const secret of [password, sessionCookieWritten()?.split("=")[1] ?? "", sam.email]) {
    expect(line).not.toContain(secret);
  }
});

it("REQ-047.2, REQ-047.3, REQ-047: a wrong password, an unknown email and a deactivated member with the right password all get the same refusal", async () => {
  const sam = await createMember({ passwordHash });
  const jo = await createMember({ passwordHash, deactivatedAt: new Date() });

  await expectRefused(signIn({ email: sam.email, password: "wrong password!!" }), incorrect);
  await expectRefused(signIn({ email: "nobody-047-3@x.com", password }), incorrect);
  await expectRefused(signIn({ email: jo.email, password }), incorrect);
});

it("REQ-047.5: after signing in, the page Sam was sent away from loads", async () => {
  const sam = await createMember({ passwordHash });
  const openIssue = (cookie?: string) =>
    getIssue(
      new Request("http://localhost:3000/api/issues/WEB-42", { headers: cookie ? { Cookie: cookie } : {} }),
    );
  expect((await openIssue()).status).toBe(401);

  await signIn({ email: sam.email, password });

  expect((await openIssue(sessionCookieWritten())).status).not.toBe(401);
});

it("SEC-001.1: 10 wrong passwords lock out the right one, and a successful sign-in in between doesn't reset the count", async () => {
  const sam = await createMember({ passwordHash });
  for (let attempt = 0; attempt < 9; attempt++) {
    expect(await signIn({ email: sam.email, password: "wrong password!!" })).toEqual(incorrect);
  }
  expect(await signIn({ email: sam.email, password })).toEqual({ ok: true, data: null });
  expect(await signIn({ email: sam.email, password: "wrong password!!" })).toEqual(incorrect);

  await expectRefused(signIn({ email: sam.email, password }), tooMany);
});

it("SEC-001.3: an unknown email tried 11 times gets the same limit message", async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    await expectRefused(signIn({ email: "stranger@x.com", password }), incorrect);
  }

  await expectRefused(signIn({ email: "stranger@x.com", password }), tooMany);
});

it("SEC-001: 30 failures from one IP block any email from that IP, read from the rightmost X-Forwarded-For", async () => {
  const sam = await createMember({ passwordHash });
  const ip = uniqueIp();
  await seedFailures({ email: "someone-else@x.com", ip }, 30);

  await expectRefused(signIn({ email: sam.email, password }, `203.0.113.7, ${ip}`), tooMany);
  expect(await signIn({ email: sam.email, password }, `${ip}, ${uniqueIp()}`)).toEqual({
    ok: true,
    data: null,
  });
});

it("SEC-001: failures older than an hour don't count", async () => {
  const sam = await createMember({ passwordHash });
  await seedFailures({ email: sam.email, ip: uniqueIp() }, 10);
  await db
    .update(signInAttempts)
    .set({ createdAt: sql`now() - interval '61 minutes'` })
    .where(eq(signInAttempts.email, sam.email));

  expect(await signIn({ email: sam.email, password })).toEqual({ ok: true, data: null });
});

it("§4.1: a wrong password leaves a hash made with older settings alone; the right one stores a hash with the current settings", async () => {
  const olderHash = await hashWithOlderSettings(password);
  const sam = await createMember({ passwordHash: olderHash });

  expect(await signIn({ email: sam.email, password: "wrong password!!" })).toEqual(incorrect);
  expect(await storedHash(sam.id)).toBe(olderHash);

  expect(await signIn({ email: sam.email, password })).toEqual({ ok: true, data: null });

  const rehashed = await storedHash(sam.id);
  expect(rehashed.startsWith(currentSettingsPrefix)).toBe(true);
  expect(await verifyPassword(rehashed, password)).toBe(true);
});