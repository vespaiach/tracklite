import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../server/db";
import { outbox } from "../../../server/email/outbox";
import { members, sessions } from "../../../server/schema";
import { createSession } from "../../../server/sessions";
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
import { jsonRequest } from "../../../test/reset-links";
import { GET as getMe } from "../me/route";
import { GET, POST } from "./route";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  outbox.sent = [];
  outbox.failing = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function listAs(role: "admin" | "member") {
  const viewer = await createMember({ role });
  const response = await GET(
    new Request("http://localhost:3000/api/members", {
      headers: { Cookie: `session=${await createSession(viewer.id)}` },
    }),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { username: string }[];
}

function rowFor(list: { username: string }[], username: string) {
  return list.find((row) => row.username === username);
}

it("§3.3: members get every member, active and deactivated, without emails or roles", async () => {
  const sam = await createMember({ fullName: "Sam Lee", role: "admin" });
  const jo = await createMember({ fullName: "Jo Park", deactivatedAt: new Date() });

  const list = await listAs("member");

  expect(rowFor(list, sam.username)).toEqual({
    username: sam.username,
    fullName: "Sam Lee",
    initials: "SL",
    deactivated: false,
  });
  expect(rowFor(list, jo.username)).toEqual({
    username: jo.username,
    fullName: "Jo Park",
    initials: "JP",
    deactivated: true,
  });
});

it("REQ-051: admins get every member with email and role", async () => {
  const sam = await createMember({ fullName: "Sam Lee", role: "admin" });

  const list = await listAs("admin");

  expect(rowFor(list, sam.username)).toEqual({
    username: sam.username,
    fullName: "Sam Lee",
    initials: "SL",
    deactivated: false,
    email: sam.email,
    role: "admin",
  });
});

it("REQ-007.2: the member list marks a deactivated member", async () => {
  const sam = await createMember({ deactivatedAt: new Date() });

  expect(rowFor(await listAs("member"), sam.username)).toMatchObject({ deactivated: true });
});

it("REQ-008.2: the member list no longer marks a reactivated member", async () => {
  const sam = await createMember({ deactivatedAt: new Date() });
  await db.update(members).set({ deactivatedAt: null }).where(eq(members.id, sam.id));

  expect(rowFor(await listAs("member"), sam.username)).toMatchObject({ deactivated: false });
});

it("STD-1: signed out gets 401", async () => {
  expect((await GET(new Request("http://localhost:3000/api/members"))).status).toBe(401);
});

const validPassword = "correct horse battery";
const expired = { error: { message: "This invitation has expired. Ask an admin for a new one." } };

function uniqueUsername(name = "sam") {
  return `${name}-${randomBytes(4).toString("hex")}`;
}

function accept(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return POST(jsonRequest("POST", "/api/members", body, headers));
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

async function expectExpired(response: Response) {
  expect(response.status).toBe(410);
  expect(await response.json()).toEqual(expired);
}

it("REQ-002.1: Sam accepts on day 3 and is signed in", async () => {
  const { invitation, token, email } = await openInvitation();
  await setInvitationTimestamp(invitation.id, "expiresAt", "-4 days");
  const username = uniqueUsername();

  const response = await accept(profileFor(token, username));

  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({
    username,
    fullName: "Sam Lee",
    initials: "SL",
    deactivated: false,
    email,
    role: "member",
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const me = await getMe(new Request("http://localhost:3000/api/me", { headers: { Cookie: cookie } }));
  expect(me.status).toBe(200);
  expect(await me.json()).toMatchObject({ username, email });
  await expectExpired(await lookUp(token));
});

it("REQ-002.2: a link on day 8 has expired", async () => {
  const { invitation, token, email } = await openInvitation();
  await setInvitationTimestamp(invitation.id, "expiresAt", "1 day");

  await expectExpired(await accept(profileFor(token)));
  expect(await memberCountWithEmail(email)).toBe(0);
});

it("REQ-002.2: a link already accepted has expired", async () => {
  const { token, email } = await openInvitation();
  expect((await accept(profileFor(token))).status).toBe(201);

  await expectExpired(await accept(profileFor(token)));
  expect(await memberCountWithEmail(email)).toBe(1);
});

it("REQ-002.2: an unknown link or one replaced by a resend has expired", async () => {
  const { adminCookie, invitation, token, email } = await openInvitation();
  expect((await resendInvitation(adminCookie, invitation.id)).status).toBe(200);

  await expectExpired(await accept(profileFor("not-a-real-token")));
  await expectExpired(await accept(profileFor(token)));
  expect(await memberCountWithEmail(email)).toBe(0);
});

it("REQ-002.3, STD-2: a signed-in member is refused", async () => {
  const { token, email } = await openInvitation();
  const alex = await signedIn({ fullName: "Alex Kim" });

  const response = await accept(profileFor(token), { Cookie: alex.cookie });

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    error: { message: "You're signed in as Alex Kim. Sign out to accept this invitation." },
  });
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(await memberCountWithEmail(email)).toBe(0);
  expect((await lookUp(token)).status).toBe(200);
});

it("REQ-002.3: a stale session cookie doesn't block accepting", async () => {
  const { token } = await openInvitation();
  const alex = await signedIn();
  await db.delete(sessions).where(eq(sessions.memberId, alex.member.id));

  expect((await accept(profileFor(token), { Cookie: alex.cookie })).status).toBe(201);
});

it("REQ-002.4: a link revoked mid-form is no longer valid", async () => {
  const { adminCookie, invitation, token, email } = await openInvitation();
  expect((await revokeInvitation(adminCookie, invitation.id)).status).toBe(204);

  const response = await accept(profileFor(token));

  expect(response.status).toBe(410);
  expect(await response.json()).toEqual({ error: { message: "This invitation is no longer valid." } });
  expect(await memberCountWithEmail(email)).toBe(0);
});

it("REQ-003.1: username Sam is saved as sam", async () => {
  const { token } = await openInvitation();
  const username = uniqueUsername();

  const response = await accept(profileFor(token, username.replace("sam", "Sam")));

  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ username });
});

it('REQ-003.2: a taken username gets "Username taken"', async () => {
  const taken = await createMember();
  const { token, email } = await openInvitation();

  const response = await accept(profileFor(token, taken.username));

  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { fields: { username: "Username taken" } } });
  expect(await memberCountWithEmail(email)).toBe(0);
  expect((await lookUp(token)).status).toBe(200);
});

it("REQ-003, REQ-048: every invalid field is reported at once", async () => {
  const { token, email } = await openInvitation();

  const response = await accept({ token, fullName: "   ", username: "a!", password: "elevenchars" });

  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({
    error: {
      fields: {
        fullName: "Name required",
        username: "Use 2 to 20 letters, digits or hyphens",
        password: "At least 12 characters",
      },
    },
  });
  expect(await memberCountWithEmail(email)).toBe(0);
  expect((await lookUp(token)).status).toBe(200);
});