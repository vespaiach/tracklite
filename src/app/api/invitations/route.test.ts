import { sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../server/db";
import { outbox } from "../../../server/email/outbox";
import { invitationEmail } from "../../../server/email/templates";
import { invitations } from "../../../server/schema";
import { createMember } from "../../../test/factories";
import {
  type InvitationBody,
  invite,
  invitedBy,
  latestInvitationToken,
  listedInvitation,
  listInvitations,
  lookUp,
  setInvitationTimestamp,
  signedIn,
  signedInAdmin,
  uniqueEmail,
} from "../../../test/invitations";
import { POST } from "./route";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  outbox.sent = [];
  outbox.failing = false;
});

afterEach(() => {
  vi.restoreAllMocks();
  outbox.failing = false;
});

async function storedInvitations(email: string) {
  return db.select().from(invitations).where(sql`lower(${invitations.email}) = lower(${email})`);
}

async function expectRefused(response: Response, message: string) {
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ error: { message } });
}

it("REQ-001.1: admin invites sam@acme.com → email sent; the invitation shows as Pending", async () => {
  const { member: alex, cookie } = await signedInAdmin("Alex Kim");
  const email = uniqueEmail();

  const response = await invite(cookie, email);

  expect(response.status).toBe(201);
  const created: InvitationBody = await response.json();
  const expected = {
    id: expect.any(String),
    email,
    invitedBy: { username: alex.username, fullName: "Alex Kim", initials: "AK", deactivated: false },
    expiresAt: expect.any(String),
    state: "pending",
  };
  expect(created).toEqual(expected);
  const daysLeft = (Date.parse(created.expiresAt) - Date.now()) / 86_400_000;
  expect(daysLeft).toBeGreaterThan(6.99);
  expect(daysLeft).toBeLessThanOrEqual(7);

  const token = latestInvitationToken();
  expect(outbox.sent).toEqual([{ to: email, ...invitationEmail({ inviterName: "Alex Kim", token }) }]);
  expect(await listedInvitation(cookie, email)).toEqual({ ...expected, id: created.id });
});

it('REQ-001.2: inviting an existing member\'s email → "Already a member", no email', async () => {
  const { cookie } = await signedInAdmin();
  const sam = await createMember({ email: uniqueEmail() });

  await expectRefused(await invite(cookie, sam.email), "Already a member");

  expect(outbox.sent).toEqual([]);
  expect(await storedInvitations(sam.email)).toEqual([]);
});

it('REQ-001.5: inviting Sam@Acme.com while sam@acme.com is a member → "Already a member"', async () => {
  const { cookie } = await signedInAdmin();
  const sam = await createMember({ email: uniqueEmail() });

  await expectRefused(
    await invite(cookie, sam.email.replace(/^s/, "S").replace("acme", "Acme")),
    "Already a member",
  );

  expect(outbox.sent).toEqual([]);
});

it('REQ-001.6: inviting deactivated Jo → "This person is deactivated. Reactivate them instead.", no email', async () => {
  const { cookie } = await signedInAdmin();
  const jo = await createMember({ email: uniqueEmail("jo"), deactivatedAt: new Date() });

  await expectRefused(await invite(cookie, jo.email), "This person is deactivated. Reactivate them instead.");

  expect(outbox.sent).toEqual([]);
  expect(await storedInvitations(jo.email)).toEqual([]);
});

it('REQ-001.7: email service down → 503 "We couldn\'t send the email. Try again."; no invitation is listed', async () => {
  const { cookie } = await signedInAdmin();
  const email = uniqueEmail();
  outbox.failing = true;

  const response = await invite(cookie, email);

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: { message: "We couldn't send the email. Try again." } });
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
  expect((await lookUp(first.token)).status).toBe(410);
  expect(await (await lookUp(second.token)).json()).toEqual({ email });
});

it("REQ-001: the list holds Pending, Bounced and Expired, and leaves out Accepted and Revoked", async () => {
  const { cookie } = await signedInAdmin();
  const emails = {
    pending: uniqueEmail("pending"),
    bounced: uniqueEmail("bounced"),
    expired: uniqueEmail("expired"),
    accepted: uniqueEmail("accepted"),
    revoked: uniqueEmail("revoked"),
  };
  const ids: Record<string, string> = {};
  for (const [name, email] of Object.entries(emails)) {
    ids[name] = (await invitedBy(cookie, email)).invitation.id;
  }
  await setInvitationTimestamp(ids.bounced, "bouncedAt", "1 minute");
  await setInvitationTimestamp(ids.expired, "expiresAt", "1 minute");
  await setInvitationTimestamp(ids.accepted, "acceptedAt", "1 minute");
  await setInvitationTimestamp(ids.revoked, "revokedAt", "1 minute");

  expect((await listedInvitation(cookie, emails.pending))?.state).toBe("pending");
  expect((await listedInvitation(cookie, emails.bounced))?.state).toBe("bounced");
  expect((await listedInvitation(cookie, emails.expired))?.state).toBe("expired");
  expect(await listedInvitation(cookie, emails.accepted)).toBeUndefined();
  expect(await listedInvitation(cookie, emails.revoked)).toBeUndefined();
});

it("STD-2: a member who isn't an admin gets 403 from list and invite", async () => {
  const { cookie } = await signedIn();
  const forbidden = { error: { message: "You don't have permission to do that." } };

  const listed = await listInvitations(cookie);
  const invited = await invite(cookie, uniqueEmail());

  expect(listed.status).toBe(403);
  expect(await listed.json()).toEqual(forbidden);
  expect(invited.status).toBe(403);
  expect(await invited.json()).toEqual(forbidden);
  expect(outbox.sent).toEqual([]);
});

it("STD-3: a malformed email → 422 with a field error", async () => {
  const { cookie } = await signedInAdmin();

  for (const email of ["", "sam", "sam@acme", "sam @acme.com", 42]) {
    const response = await invite(cookie, email);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: { message: "Check the highlighted fields", fields: { email: "Enter a valid email" } },
    });
  }
  expect(outbox.sent).toEqual([]);
});

it("STD-3: a member's malformed JSON to invite gets 422 \"Couldn't read the request.\", not 500", async () => {
  const { cookie } = await signedIn();
  const email = uniqueEmail();
  const request = new Request("http://localhost:3000/api/invitations", {
    method: "POST",
    headers: { Origin: "http://localhost:3000", "Content-Type": "application/json", Cookie: cookie },
    body: `{ email: ${email}`,
  });

  await expectRefused(await POST(request), "Couldn't read the request.");
  expect(await storedInvitations(email)).toEqual([]);
  expect(outbox.sent).toEqual([]);
});

it('STD-3: an invite with no email gets 422 "Required"', async () => {
  const { cookie } = await signedInAdmin();

  const response = await invite(cookie, undefined);

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: { message: "Check the highlighted fields", fields: { email: "Required" } },
  });
  expect(outbox.sent).toEqual([]);
});

it("REQ-001: an email with spaces around it and capitals is invited trimmed and lower-cased", async () => {
  const { cookie } = await signedInAdmin();
  const email = uniqueEmail();

  const response = await invite(cookie, `  ${email.toUpperCase()} `);

  expect(response.status).toBe(201);
  expect((await response.json()).email).toBe(email);
  expect(outbox.sent.map((sent) => sent.to)).toEqual([email]);
});