import { randomInt } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "../../../server/passwords";
import { members, signInAttempts } from "../../../server/schema";
import { db } from "../../../server/db";
import { createMember } from "../../../test/factories";
import { GET as getIssue } from "../[...path]/route";
import { GET as getMe } from "../me/route";
import { POST } from "./route";

const password = "correct horse battery";
let passwordHash: string;

beforeEach(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  passwordHash ??= await hashPassword(password);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function uniqueIp() {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(256)}`;
}

function signIn(body: { email: string; password: string }, forwardedFor = uniqueIp()) {
  return POST(
    new Request("http://localhost:3000/api/sessions", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        "X-Forwarded-For": forwardedFor,
      },
      body: JSON.stringify(body),
    }),
  );
}

function cookieFrom(response: Response) {
  return response.headers.get("set-cookie")?.split(";")[0];
}

async function signedInUsername(cookie: string | undefined) {
  const response = await getMe(
    new Request("http://localhost:3000/api/me", { headers: cookie ? { Cookie: cookie } : {} }),
  );
  return response.status === 200 ? ((await response.json()) as { username: string }).username : undefined;
}

const incorrect = { error: { message: "Incorrect email or password." } };
const tooMany = { error: { message: "Too many attempts. Try again later." } };

async function expectRefused(response: Response, body: object, status: number) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual(body);
  expect(response.headers.get("set-cookie")).toBeNull();
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

  const response = await signIn({ email: sam.email.toUpperCase(), password });

  expect(response.status).toBe(204);
  expect(await signedInUsername(cookieFrom(response))).toBe(sam.username);
  expect(await storedHash(sam.id)).toBe(passwordHash);
});

it("REQ-047.2, REQ-047.3, REQ-047: a wrong password, an unknown email and a deactivated member with the right password all get the same refusal", async () => {
  const sam = await createMember({ passwordHash });
  const jo = await createMember({ passwordHash, deactivatedAt: new Date() });

  await expectRefused(await signIn({ email: sam.email, password: "wrong password!!" }), incorrect, 422);
  await expectRefused(await signIn({ email: "nobody-047-3@x.com", password }), incorrect, 422);
  await expectRefused(await signIn({ email: jo.email, password }), incorrect, 422);
});

it("REQ-047.5: after signing in, the page Sam was sent away from loads", async () => {
  const sam = await createMember({ passwordHash });
  const openIssue = (cookie?: string) =>
    getIssue(
      new Request("http://localhost:3000/api/issues/WEB-42", { headers: cookie ? { Cookie: cookie } : {} }),
    );
  expect((await openIssue()).status).toBe(401);

  const cookie = cookieFrom(await signIn({ email: sam.email, password }));

  expect((await openIssue(cookie)).status).not.toBe(401);
});

it("SEC-001.1: 10 wrong passwords lock out the right one, and a successful sign-in in between doesn't reset the count", async () => {
  const sam = await createMember({ passwordHash });
  for (let attempt = 0; attempt < 9; attempt++) {
    expect((await signIn({ email: sam.email, password: "wrong password!!" })).status).toBe(422);
  }
  expect((await signIn({ email: sam.email, password })).status).toBe(204);
  expect((await signIn({ email: sam.email, password: "wrong password!!" })).status).toBe(422);

  await expectRefused(await signIn({ email: sam.email, password }), tooMany, 429);
});

it("SEC-001.3: an unknown email tried 11 times gets the same limit message", async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    await expectRefused(await signIn({ email: "stranger@x.com", password }), incorrect, 422);
  }

  await expectRefused(await signIn({ email: "stranger@x.com", password }), tooMany, 429);
});

it("SEC-001: 30 failures from one IP block any email from that IP, read from the rightmost X-Forwarded-For", async () => {
  const sam = await createMember({ passwordHash });
  const ip = uniqueIp();
  await seedFailures({ email: "someone-else@x.com", ip }, 30);

  await expectRefused(await signIn({ email: sam.email, password }, `203.0.113.7, ${ip}`), tooMany, 429);
  expect((await signIn({ email: sam.email, password }, `${ip}, ${uniqueIp()}`)).status).toBe(204);
});

it("SEC-001: failures older than an hour don't count", async () => {
  const sam = await createMember({ passwordHash });
  await seedFailures({ email: sam.email, ip: uniqueIp() }, 10);
  await db
    .update(signInAttempts)
    .set({ createdAt: sql`now() - interval '61 minutes'` })
    .where(eq(signInAttempts.email, sam.email));

  expect((await signIn({ email: sam.email, password })).status).toBe(204);
});

it("§4.1: a wrong password leaves a hash made with older settings alone; the right one stores a hash with the current settings", async () => {
  const olderHash = await hashWithOlderSettings(password);
  const sam = await createMember({ passwordHash: olderHash });

  expect((await signIn({ email: sam.email, password: "wrong password!!" })).status).toBe(422);
  expect(await storedHash(sam.id)).toBe(olderHash);

  expect((await signIn({ email: sam.email, password })).status).toBe(204);

  const rehashed = await storedHash(sam.id);
  expect(rehashed.startsWith(currentSettingsPrefix)).toBe(true);
  expect(await verifyPassword(rehashed, password)).toBe(true);
});