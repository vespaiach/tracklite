import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { beforeEach, expect, it } from "vitest";
import { db } from "../../../../infrastructure/db";
import {
  createSession,
  sessionCookieName,
  signedInMemberBy,
} from "../../../../infrastructure/identity/session";
import { members } from "../../../../infrastructure/identity/tables";
import { hashPassword } from "../../../../infrastructure/passwords";
import { outcome, signInAs } from "../../../../test/actions";
import { createMember } from "../../../../test/factories";
import { setNextRequest } from "../../../../test/next-request";
import { uniqueIp } from "../../../../test/reset-links";
import { changePassword, updateProfile } from "./actions";

const oldPassword = "correct horse battery";
const newPassword = "a brand new password";
let oldPasswordHash: string;

beforeEach(async () => {
  oldPasswordHash ??= await hashPassword(oldPassword);
});

async function signedInSam(fullName = "Sam Rivera") {
  const sam = await createMember({ fullName, passwordHash: oldPasswordHash });
  const token = await createSession(sam.id);
  return { sam, token, ip: uniqueIp() };
}

function sendAs({ token, ip }: { token: string; ip: string }) {
  setNextRequest({ cookies: { [sessionCookieName()]: token }, headers: { "x-forwarded-for": ip } });
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

function rename(session: { token: string; ip: string }, fields: Record<string, string>) {
  sendAs(session);
  return updateProfile(form(fields));
}

function change(session: { token: string; ip: string }, currentPassword: string, password = newPassword) {
  sendAs(session);
  return changePassword(form({ currentPassword, newPassword: password }));
}

async function storedMember(id: string) {
  const [member] = await db.select().from(members).where(eq(members.id, id));
  return member;
}

function fieldError(field: string, message: string) {
  return {
    ok: false,
    error: { kind: "invalid", message: "Check the highlighted fields", fields: { [field]: message } },
  };
}

it("REQ-003.3, REQ-003: Save stores a new, trimmed full name and refreshes the page", async () => {
  const session = await signedInSam();

  expect(await rename(session, { fullName: "  Sam Lee  " })).toEqual({ ok: true, data: null });

  expect(refresh).toHaveBeenCalledOnce();
  expect(await storedMember(session.sam.id)).toMatchObject({ fullName: "Sam Lee" });
});

it('REQ-003: an empty or blank name gets "Name required" and one over 60 characters after trimming gets "Too long (max 60)"; 60 is saved', async () => {
  const session = await signedInSam();

  for (const [fullName, message] of [
    ["", "Name required"],
    ["   ", "Name required"],
    [` ${"a".repeat(61)} `, "Too long (max 60)"],
  ]) {
    expect(await rename(session, { fullName })).toEqual(fieldError("fullName", message));
  }
  expect((await storedMember(session.sam.id)).fullName).toBe("Sam Rivera");

  expect(outcome(await rename(session, { fullName: ` ${"a".repeat(60)} ` }))).toBe("ok");
  expect((await storedMember(session.sam.id)).fullName).toBe("a".repeat(60));
});

it("REQ-003.3: changing the username or email is refused", async () => {
  const session = await signedInSam();

  for (const [field, value] of [
    ["username", "someone-else"],
    ["email", "someone@else.test"],
  ]) {
    expect(await rename(session, { fullName: "Sam Lee", [field]: value })).toEqual(
      fieldError(field, "Can't be changed"),
    );
  }
  expect(await storedMember(session.sam.id)).toMatchObject({
    fullName: "Sam Rivera",
    username: session.sam.username,
    email: session.sam.email,
  });
});

it("REQ-049.1: the right current password and a valid new one are saved; this session stays and others end", async () => {
  const session = await signedInSam();
  const otherComputer = await createSession(session.sam.id);

  expect(await change(session, oldPassword)).toEqual({ ok: true, data: null });

  expect(await signedInMemberBy(session.token)).toBeDefined();
  expect(await signedInMemberBy(otherComputer)).toBeUndefined();
  expect(outcome(await signInAs(session.sam.email, oldPassword))).toBe("invalid");
  expect(outcome(await signInAs(session.sam.email, newPassword))).toBe("ok");
});

it('REQ-049.2, REQ-048: a wrong current password gets "Incorrect password", a new one that is too short gets "At least 12 characters", and the old password still works', async () => {
  const session = await signedInSam();

  expect(await change(session, "not my password at all")).toEqual(
    fieldError("currentPassword", "Incorrect password"),
  );
  expect(await change(session, oldPassword, "Sh0rt!pass")).toEqual(
    fieldError("newPassword", "At least 12 characters"),
  );
  expect(outcome(await signInAs(session.sam.email, oldPassword))).toBe("ok");
});

it("REQ-049.3, SEC-001: after 10 wrong current passwords the 11th try is refused even when right, and they count toward the sign-in limit", async () => {
  const session = await signedInSam();
  for (let i = 0; i < 10; i++) {
    expect(outcome(await change(session, "not my password at all"))).toBe("invalid");
  }

  expect(await change(session, oldPassword)).toEqual({
    ok: false,
    error: { kind: "limited", message: "Too many attempts. Try again later." },
  });

  expect(outcome(await signInAs(session.sam.email, newPassword))).toBe("limited");
  expect(outcome(await signInAs(session.sam.email, oldPassword))).toBe("limited");
  expect(await signedInMemberBy(session.token)).toBeDefined();
});