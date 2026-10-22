import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../server/shared/db";
import { outbox } from "../../../server/shared/email/outbox";
import { members, sessions } from "../../../server/shared/schema";
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

it("§3.3, REQ-007.2, REQ-008.2: members get every member, a deactivated one marked and a reactivated one not, without emails or roles", async () => {
  const sam = await createMember({ fullName: "Sam Lee", role: "admin" });
  const jo = await createMember({ fullName: "Jo Park", deactivatedAt: new Date() });
  const reactivated = await createMember({ deactivatedAt: new Date() });
  await db.update(members).set({ deactivatedAt: null }).where(eq(members.id, reactivated.id));

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
  expect(rowFor(list, reactivated.username)).toMatchObject({ deactivated: false });
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

it("REQ-002.1, REQ-003.1: Sam accepts on day 3 with username Sam, saved as sam, and is signed in", async () => {
  const { invitation, token, email } = await openInvitation();
  await setInvitationTimestamp(invitation.id, "expiresAt", "-4 days");
  const username = uniqueUsername();

  const response = await accept(profileFor(token, username.replace("sam", "Sam")));

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

it("REQ-002.2: a link on day 8, one already accepted, an unknown one and one replaced by a resend have all expired", async () => {
  const dayEight = await openInvitation();
  await setInvitationTimestamp(dayEight.invitation.id, "expiresAt", "1 day");
  const accepted = await openInvitation();
  expect((await accept(profileFor(accepted.token))).status).toBe(201);
  const replaced = await openInvitation();
  expect((await resendInvitation(replaced.adminCookie, replaced.invitation.id)).status).toBe(200);

  await expectExpired(await accept(profileFor(dayEight.token)));
  await expectExpired(await accept(profileFor(accepted.token)));
  await expectExpired(await accept(profileFor("not-a-real-token")));
  await expectExpired(await accept(profileFor(replaced.token)));
  expect(await memberCountWithEmail(dayEight.email)).toBe(0);
  expect(await memberCountWithEmail(accepted.email)).toBe(1);
  expect(await memberCountWithEmail(replaced.email)).toBe(0);
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

it("REQ-002: a stale session cookie doesn't block accepting", async () => {
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