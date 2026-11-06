import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../infrastructure/db";
import { outbox } from "../../../../infrastructure/email/outbox";
import { invitationEmail } from "../../../../infrastructure/email/templates";
import { hashPassword } from "../../../../infrastructure/passwords";
import { invitations, members, sessions, type Member } from "../../../../infrastructure/identity/tables";
import {
  createSession,
  sessionCookieName,
  signedInMemberBy,
} from "../../../../infrastructure/identity/session";
import { fromNewIp, outcome, sessionCookieWritten, signInAs } from "../../../../test/actions";
import { createMember } from "../../../../test/factories";
import {
  invite,
  invited,
  invitedBy,
  latestInvitationToken,
  listedInvitation,
  lookUp,
  resendInvitation,
  revokeInvitation,
  setInvitationTimestamp,
  signedIn,
  signedInAdmin,
  uniqueEmail,
} from "../../../../test/invitations";
import { setNextRequest } from "../../../../test/next-request";
import { resetTokenFor } from "../../../../test/reset-links";
import { requestResetLink } from "../../../(signed-out)/forgot-password/actions";
import { resetPassword } from "../../../(signed-out)/reset-password/actions";
import { updateProfile } from "../profile/actions";
import { createInvitation, updateMember } from "./actions";

const password = "correct horse battery";
let passwordHash: string;

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  outbox.sent = [];
  outbox.failing = false;
  passwordHash ??= await hashPassword(password);
});

afterEach(() => {
  vi.restoreAllMocks();
  outbox.failing = false;
});

const sendFailed = {
  ok: false,
  error: { kind: "unavailable", message: "We couldn’t send the email. Try again." },
};
const notFound = { ok: false, error: { kind: "notFound", message: "Not found" } };
const lastAdmin = { ok: false, error: { kind: "invalid", message: "There must be at least one admin." } };

function refusedWith(message: string) {
  return { ok: false, error: { kind: "invalid", message } };
}

function emailRefused(message: string) {
  return {
    ok: false,
    error: { kind: "invalid", message: "Check the highlighted fields", fields: { email: message } },
  };
}

function tokenOf(cookie: string) {
  return cookie.slice(cookie.indexOf("=") + 1);
}

function signedInWithPassword(role: "admin" | "member", overrides: Partial<Member> = {}) {
  return signedIn({ role, passwordHash, ...overrides });
}

function changeMember(cookie: string, username: string, changes: Record<string, unknown>) {
  setNextRequest({ cookies: { [sessionCookieName()]: tokenOf(cookie) } });
  return updateMember({ username, ...changes } as Parameters<typeof updateMember>[0]);
}

async function storedMember(id: string) {
  const [member] = await db.select().from(members).where(eq(members.id, id));
  return member;
}

async function storedInvitations(email: string) {
  return db.select().from(invitations).where(sql`lower(${invitations.email}) = lower(${email})`);
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

function expectSevenDaysLeft(expiresAt: string) {
  const daysLeft = (Date.parse(expiresAt) - Date.now()) / 86_400_000;
  expect(daysLeft).toBeGreaterThan(6.99);
  expect(daysLeft).toBeLessThanOrEqual(7);
}

it("REQ-001.1, REQ-001: admin invites sam@acme.com, with spaces and capitals → trimmed and lower-cased, email sent, the page refreshed; the invitation shows as Pending", async () => {
  const { member: alex, cookie } = await signedInAdmin("Alex Kim");
  const email = uniqueEmail();

  const created = invited(await invite(cookie, `  ${email.toUpperCase()} `));

  const expected = {
    id: expect.any(String),
    email,
    invitedBy: { username: alex.username, fullName: "Alex Kim", initials: "AK", deactivated: false },
    expiresAt: expect.any(String),
    state: "pending",
  };
  expect(created).toEqual(expected);
  expectSevenDaysLeft(created.expiresAt);
  expect(refresh).toHaveBeenCalledOnce();

  const token = latestInvitationToken();
  expect(outbox.sent).toEqual([{ to: email, ...invitationEmail({ inviterName: "Alex Kim", token }) }]);
  expect(await listedInvitation(cookie, email)).toEqual({ ...expected, id: created.id });
});

it('REQ-001.2, REQ-001.5, REQ-001.6: inviting a member\'s email, in any capitals, gets "Already a member", and inviting deactivated Jo gets "This person is deactivated. Reactivate them instead."; no email is sent', async () => {
  const { cookie } = await signedInAdmin();
  const sam = await createMember({ email: uniqueEmail() });
  const jo = await createMember({ email: uniqueEmail("jo"), deactivatedAt: new Date() });

  expect(await invite(cookie, sam.email)).toEqual(refusedWith("Already a member"));
  expect(await invite(cookie, sam.email.replace(/^s/, "S").replace("acme", "Acme"))).toEqual(
    refusedWith("Already a member"),
  );
  expect(await invite(cookie, jo.email)).toEqual(
    refusedWith("This person is deactivated. Reactivate them instead."),
  );

  expect(outbox.sent).toEqual([]);
  expect(await storedInvitations(sam.email)).toEqual([]);
  expect(await storedInvitations(jo.email)).toEqual([]);
});

it('REQ-001.7, OPS-007.7: email service down → "We couldn’t send the email. Try again."; no invitation is listed', async () => {
  const { cookie } = await signedInAdmin();
  const email = uniqueEmail();
  outbox.failing = true;

  expect(await invite(cookie, email)).toEqual(sendFailed);

  expect(await listedInvitation(cookie, email)).toBeUndefined();
  expect(await storedInvitations(email)).toEqual([]);
});

it("REQ-001: inviting an email that has an open invitation resends it", async () => {
  const { cookie } = await signedInAdmin();
  const email = uniqueEmail();
  const first = await invitedBy(cookie, email);

  const second = await invitedBy(cookie, email.toUpperCase());

  expect(second.invitation.id).toBe(first.invitation.id);
  expect(await storedInvitations(email)).toHaveLength(1);
  expect(await lookUp(first.token)).toHaveProperty("expired");
  expect(await lookUp(second.token)).toEqual({ email });
});

it("STD-3: a malformed or missing email is refused beside the field", async () => {
  const { cookie } = await signedInAdmin();

  for (const [email, message] of [
    ["", "Enter a valid email"],
    ["sam", "Enter a valid email"],
    ["sam@acme", "Enter a valid email"],
    ["sam @acme.com", "Enter a valid email"],
    [42, "Enter a valid email"],
  ] as [unknown, string][]) {
    expect(await invite(cookie, email)).toEqual(emailRefused(message));
  }
  setNextRequest({ cookies: { [sessionCookieName()]: tokenOf(cookie) } });
  expect(await createInvitation(new FormData())).toEqual(emailRefused("Required"));
  expect(outbox.sent).toEqual([]);
});

it("REQ-001.4, REQ-001: revoking Sam's invitation → the link stops working, and the same email can be invited again", async () => {
  const { cookie } = await signedInAdmin();
  const email = uniqueEmail();
  const { invitation, token } = await invitedBy(cookie, email);

  expect(await revokeInvitation(cookie, invitation.id)).toEqual({ ok: true, data: null });

  expect(await lookUp(token)).toEqual({ expired: "This invitation is no longer valid." });
  expect(await listedInvitation(cookie, email)).toBeUndefined();

  const again = await invitedBy(cookie, email);

  expect(again.invitation.id).not.toBe(invitation.id);
  expect(await lookUp(again.token)).toEqual({ email });
});

it('STD-4: revoking or resending an unknown, already revoked or malformed id → "Not found"', async () => {
  const { cookie } = await signedInAdmin();
  const { invitation } = await invitedBy(cookie, uniqueEmail());
  await revokeInvitation(cookie, invitation.id);
  outbox.sent = [];

  for (const id of [invitation.id, crypto.randomUUID(), "not-a-uuid"]) {
    expect(await revokeInvitation(cookie, id)).toEqual(notFound);
    expect(await resendInvitation(cookie, id)).toEqual(notFound);
  }
  expect(outbox.sent).toEqual([]);
});

it("REQ-001.3, REQ-001: Jo resending Sam's pending invitation → a new link is sent in Jo's name and the old link stops working", async () => {
  const { cookie: alexCookie } = await signedInAdmin("Alex Kim");
  const { member: jo, cookie } = await signedInAdmin("Jo Park");
  const email = uniqueEmail();
  const { invitation, token: oldToken } = await invitedBy(alexCookie, email);

  expect(await resendInvitation(cookie, invitation.id)).toEqual({
    ok: true,
    data: {
      ...invitation,
      invitedBy: { username: jo.username, fullName: "Jo Park", initials: "JP", deactivated: false },
      expiresAt: expect.any(String),
    },
  });

  const newToken = latestInvitationToken();
  expect(newToken).not.toBe(oldToken);
  expect(outbox.sent.at(-1)).toEqual({
    to: email,
    ...invitationEmail({ inviterName: "Jo Park", token: newToken }),
  });
  expect(await lookUp(oldToken)).toHaveProperty("expired");
  expect(await lookUp(newToken)).toEqual({ email });
});

it("REQ-001.7: a failed resend is refused and keeps the previous link working", async () => {
  const { cookie } = await signedInAdmin();
  const email = uniqueEmail();
  const { invitation, token } = await invitedBy(cookie, email);
  outbox.failing = true;

  expect(await resendInvitation(cookie, invitation.id)).toEqual(sendFailed);

  expect(await lookUp(token)).toEqual({ email });
  expect(await listedInvitation(cookie, email)).toEqual(invitation);
});

it("REQ-051.3, REQ-001: resending an expired invitation → a new link valid for 7 days, shown as Pending; a resent bounced one is Pending again too", async () => {
  const { cookie } = await signedInAdmin();
  const email = uniqueEmail();
  const bouncedEmail = uniqueEmail("bounced");
  const { invitation } = await invitedBy(cookie, email);
  const { invitation: bounced } = await invitedBy(cookie, bouncedEmail);
  await setInvitationTimestamp(invitation.id, "expiresAt", "1 day");
  await setInvitationTimestamp(bounced.id, "bouncedAt", "1 minute");
  expect((await listedInvitation(cookie, email))?.state).toBe("expired");

  const resent = invited(await resendInvitation(cookie, invitation.id));

  expect(resent.state).toBe("pending");
  expectSevenDaysLeft(resent.expiresAt);
  expect((await listedInvitation(cookie, email))?.state).toBe("pending");
  expect(await lookUp(latestInvitationToken())).toEqual({ email });

  await resendInvitation(cookie, bounced.id);

  expect((await listedInvitation(cookie, bouncedEmail))?.state).toBe("pending");
});

it("REQ-007.1, REQ-007.4: deactivating Sam ends every session, so the next page load is signed out and a save mid-edit is refused with nothing saved", async () => {
  const { cookie: adminCookie } = await signedInWithPassword("admin");
  const { member: sam, cookie: samCookie } = await signedInWithPassword("member", { fullName: "Sam Lee" });
  await createSession(sam.id);

  expect(await changeMember(adminCookie, sam.username, { deactivated: true })).toEqual({
    ok: true,
    data: null,
  });

  expect((await storedMember(sam.id)).deactivatedAt).not.toBeNull();
  expect(await signedInMemberBy(tokenOf(samCookie))).toBeUndefined();
  expect(await db.select().from(sessions).where(eq(sessions.memberId, sam.id))).toEqual([]);

  setNextRequest({ cookies: { [sessionCookieName()]: tokenOf(samCookie) } });
  expect(await updateProfile({ fullName: "Sam Rivera" })).toEqual({
    ok: false,
    error: { kind: "signedOut", message: "Sign in to continue." },
  });
  expect((await storedMember(sam.id)).fullName).toBe("Sam Lee");
});

it('REQ-007.1, REQ-007.5: a deactivated member\'s correct password gets "Incorrect email or password.", a reset request sends nothing, and an earlier reset link has expired', async () => {
  const { cookie: adminCookie } = await signedInWithPassword("admin");
  const { member: sam } = await signedInWithPassword("member");
  const token = await resetTokenFor(sam.email);
  outbox.sent = [];

  await changeMember(adminCookie, sam.username, { deactivated: true });

  expect(await signInAs(sam.email, password)).toEqual({
    ok: false,
    error: { kind: "invalid", message: "Incorrect email or password." },
  });

  fromNewIp();
  expect(outcome(await requestResetLink({ email: sam.email }))).toBe("ok");
  expect(outbox.sent).toEqual([]);

  fromNewIp();
  expect(await resetPassword({ token, password: "a brand new password" })).toEqual({
    ok: false,
    error: { kind: "expired", message: "This link has expired" },
  });
  expect(sessionCookieWritten()).toBeUndefined();
  expect((await storedMember(sam.id)).passwordHash).toBe(passwordHash);
});

it("REQ-007.3: the only admin can't deactivate themselves or remove their own admin role", async () => {
  const { member: alex, cookie } = await signedInWithPassword("admin");
  await makeOnlyAdmins(alex);

  for (const changes of [{ deactivated: true }, { role: "member" }]) {
    expect(await changeMember(cookie, alex.username, changes)).toEqual(lastAdmin);
  }
  expect(await storedMember(alex.id)).toMatchObject({ role: "admin", deactivatedAt: null });
  expect(await signedInMemberBy(tokenOf(cookie))).toBeDefined();
});

it("REQ-008.1: a reactivated member signs in with their existing password and profile", async () => {
  const { cookie: adminCookie } = await signedInWithPassword("admin");
  const { member: sam } = await signedInWithPassword("member", { fullName: "Sam Lee" });
  await changeMember(adminCookie, sam.username, { deactivated: true });

  expect(outcome(await changeMember(adminCookie, sam.username, { deactivated: false }))).toBe("ok");

  expect(outcome(await signInAs(sam.email, password))).toBe("ok");
  const cookie = sessionCookieWritten() ?? "";
  expect(await signedInMemberBy(tokenOf(cookie))).toMatchObject({
    username: sam.username,
    fullName: "Sam Lee",
    deactivatedAt: null,
  });
});

it("REQ-052.1, §3.1: a member made admin, with the username matched ignoring capitals, is an admin from their next request", async () => {
  const { cookie: adminCookie } = await signedInWithPassword("admin");
  const { member: sam, cookie: samCookie } = await signedInWithPassword("member");

  expect(outcome(await changeMember(adminCookie, sam.username.toUpperCase(), { role: "admin" }))).toBe("ok");

  expect(await signedInMemberBy(tokenOf(samCookie))).toMatchObject({ role: "admin" });
});

it("REQ-052.2: a member whose admin role was removed is refused on their next admin save", async () => {
  const { cookie: adminCookie } = await signedInWithPassword("admin");
  const { member: jo, cookie: joCookie } = await signedInWithPassword("admin");
  const { member: sam } = await signedInWithPassword("member");

  expect(outcome(await changeMember(adminCookie, jo.username, { role: "member" }))).toBe("ok");

  expect(await changeMember(joCookie, sam.username, { role: "admin" })).toEqual({
    ok: false,
    error: { kind: "forbidden", message: "You don't have permission to do that." },
  });
  expect((await storedMember(sam.id)).role).toBe("member");
  expect(await signedInMemberBy(tokenOf(joCookie))).toBeDefined();
});

it("STD-3: an admin setting a role other than admin or member, or deactivated to something other than true or false, is refused beside the field and changes nothing", async () => {
  const { cookie } = await signedInWithPassword("admin");
  const { member: sam } = await signedInWithPassword("member");

  for (const [changes, fields] of [
    [{ role: "owner" }, { role: "Choose admin or member" }],
    [{ deactivated: "yes" }, { deactivated: "Choose true or false" }],
  ]) {
    expect(await changeMember(cookie, sam.username, changes)).toEqual({
      ok: false,
      error: { kind: "invalid", message: "Check the highlighted fields", fields },
    });
  }
  expect(await storedMember(sam.id)).toMatchObject({ role: "member", deactivatedAt: null });
});

it('§3.2: an unknown username gets "Not found"', async () => {
  const { cookie } = await signedInWithPassword("admin");

  expect(await changeMember(cookie, "nobody-here", { deactivated: true })).toEqual(notFound);
});