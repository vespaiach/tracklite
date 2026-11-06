import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../infrastructure/db";
import { outbox } from "../../../infrastructure/email/outbox";
import { sessionCookieName } from "../../../infrastructure/identity/session";
import { members, sessions } from "../../../infrastructure/identity/tables";
import { fromNewIp, sessionCookieWritten } from "../../../test/actions";
import { createMember } from "../../../test/factories";
import {
  invitedBy,
  lookUp,
  resendInvitation,
  revokeInvitation,
  setInvitationTimestamp,
  signedIn,
  signedInAdmin,
  uniqueEmail,
} from "../../../test/invitations";
import { GET as getMe } from "../../api/me/route";
import { acceptInvitation } from "./actions";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  outbox.sent = [];
  outbox.failing = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const validPassword = "correct horse battery";
const expired = {
  ok: false,
  error: { kind: "expired", message: "This invitation has expired. Ask an admin for a new one." },
};

function uniqueUsername(name = "sam") {
  return `${name}-${randomBytes(4).toString("hex")}`;
}

function accept(input: Record<string, unknown>, sessionToken?: string) {
  fromNewIp(sessionToken ? { [sessionCookieName()]: sessionToken } : {});
  return acceptInvitation(input);
}

function profileFor(token: unknown, username = uniqueUsername()) {
  return { token, fullName: "Sam Lee", username, password: validPassword };
}

async function openInvitation(email = uniqueEmail()) {
  const { cookie } = await signedInAdmin();
  const { invitation, token } = await invitedBy(cookie, email);
  return { adminCookie: cookie, invitation, token, email };
}

async function memberCountWithEmail(email: string) {
  return db.$count(members, eq(sql`lower(${members.email})`, email.toLowerCase()));
}

function tokenOf(cookie: string) {
  return cookie.slice(cookie.indexOf("=") + 1);
}

it("REQ-002.1, REQ-003.1: Sam accepts on day 3 with username Sam, saved as sam, and is signed in", async () => {
  const { invitation, token, email } = await openInvitation();
  await setInvitationTimestamp(invitation.id, "expiresAt", "-4 days");
  const username = uniqueUsername();

  expect(await accept(profileFor(token, username.replace("sam", "Sam")))).toEqual({ ok: true, data: null });

  const me = await getMe(
    new Request("http://localhost:3000/api/me", { headers: { Cookie: sessionCookieWritten() ?? "" } }),
  );
  expect(me.status).toBe(200);
  expect(await me.json()).toMatchObject({ username, email, fullName: "Sam Lee", role: "member" });
  expect(await lookUp(token)).toHaveProperty("expired");
});

it("REQ-002.2: a link on day 8, one already accepted, an unknown one and one replaced by a resend have all expired", async () => {
  const dayEight = await openInvitation();
  await setInvitationTimestamp(dayEight.invitation.id, "expiresAt", "1 day");
  const accepted = await openInvitation();
  expect(await accept(profileFor(accepted.token))).toEqual({ ok: true, data: null });
  const replaced = await openInvitation();
  expect((await resendInvitation(replaced.adminCookie, replaced.invitation.id)).status).toBe(200);

  expect(await accept(profileFor(dayEight.token))).toEqual(expired);
  expect(await accept(profileFor(accepted.token))).toEqual(expired);
  expect(await accept(profileFor("not-a-real-token"))).toEqual(expired);
  expect(await accept(profileFor(replaced.token))).toEqual(expired);
  expect(await memberCountWithEmail(dayEight.email)).toBe(0);
  expect(await memberCountWithEmail(accepted.email)).toBe(1);
  expect(await memberCountWithEmail(replaced.email)).toBe(0);
});

it("REQ-002.3, STD-2: a signed-in member is refused", async () => {
  const { token, email } = await openInvitation();
  const alex = await signedIn({ fullName: "Alex Kim" });

  expect(await accept(profileFor(token), tokenOf(alex.cookie))).toEqual({
    ok: false,
    error: {
      kind: "forbidden",
      message: "You're signed in as Alex Kim. Sign out to accept this invitation.",
    },
  });
  expect(sessionCookieWritten()).toBeUndefined();
  expect(await memberCountWithEmail(email)).toBe(0);
  expect(await lookUp(token)).toEqual({ email });
});

it("REQ-002: a stale session cookie doesn't block accepting", async () => {
  const { token } = await openInvitation();
  const alex = await signedIn();
  await db.delete(sessions).where(eq(sessions.memberId, alex.member.id));

  expect(await accept(profileFor(token), tokenOf(alex.cookie))).toEqual({ ok: true, data: null });
});

it("REQ-002.4: a link revoked mid-form is no longer valid", async () => {
  const { adminCookie, invitation, token, email } = await openInvitation();
  expect((await revokeInvitation(adminCookie, invitation.id)).status).toBe(204);

  expect(await accept(profileFor(token))).toEqual({
    ok: false,
    error: { kind: "expired", message: "This invitation is no longer valid." },
  });
  expect(await memberCountWithEmail(email)).toBe(0);
});

it('REQ-003.2: a taken username gets "Username taken"', async () => {
  const taken = await createMember();
  const { token, email } = await openInvitation();

  expect(await accept(profileFor(token, taken.username))).toMatchObject({
    ok: false,
    error: { kind: "invalid", fields: { username: "Username taken" } },
  });
  expect(await memberCountWithEmail(email)).toBe(0);
  expect(await lookUp(token)).toEqual({ email });
});

it("REQ-003, REQ-048: every invalid field is reported at once", async () => {
  const { token, email } = await openInvitation();

  expect(await accept({ token, fullName: "   ", username: "a!", password: "elevenchars" })).toMatchObject({
    ok: false,
    error: {
      kind: "invalid",
      fields: {
        fullName: "Name required",
        username: "Use 2 to 20 letters, digits or hyphens",
        password: "At least 12 characters",
      },
    },
  });
  expect(await memberCountWithEmail(email)).toBe(0);
  expect(await lookUp(token)).toEqual({ email });
});