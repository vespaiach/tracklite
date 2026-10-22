import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { outbox } from "../../../../../server/email/outbox";
import { invitationEmail } from "../../../../../server/email/templates";
import {
  type InvitationBody,
  invitedBy,
  latestInvitationToken,
  listedInvitation,
  lookUp,
  resendInvitation,
  setInvitationTimestamp,
  signedInAdmin,
  uniqueEmail,
} from "../../../../../test/invitations";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  outbox.sent = [];
  outbox.failing = false;
});

afterEach(() => {
  vi.restoreAllMocks();
  outbox.failing = false;
});

it("REQ-001.3, REQ-001: Jo resending Sam's pending invitation → a new link is sent in Jo's name and the old link stops working", async () => {
  const { cookie: alexCookie } = await signedInAdmin("Alex Kim");
  const { member: jo, cookie } = await signedInAdmin("Jo Park");
  const email = uniqueEmail();
  const { invitation, token: oldToken } = await invitedBy(alexCookie, email);

  const response = await resendInvitation(cookie, invitation.id);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    ...invitation,
    invitedBy: { username: jo.username, fullName: "Jo Park", initials: "JP", deactivated: false },
    expiresAt: expect.any(String),
  });
  const newToken = latestInvitationToken();
  expect(newToken).not.toBe(oldToken);
  expect(outbox.sent.at(-1)).toEqual({
    to: email,
    ...invitationEmail({ inviterName: "Jo Park", token: newToken }),
  });
  expect((await lookUp(oldToken)).status).toBe(410);
  expect(await (await lookUp(newToken)).json()).toEqual({ email });
});

it("REQ-001.7: a failed resend answers 503 and keeps the previous link working", async () => {
  const { cookie } = await signedInAdmin();
  const email = uniqueEmail();
  const { invitation, token } = await invitedBy(cookie, email);
  outbox.failing = true;

  const response = await resendInvitation(cookie, invitation.id);

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: { message: "We couldn't send the email. Try again." } });
  expect(await (await lookUp(token)).json()).toEqual({ email });
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

  const resent: InvitationBody = await (await resendInvitation(cookie, invitation.id)).json();

  expect(resent.state).toBe("pending");
  const daysLeft = (Date.parse(resent.expiresAt) - Date.now()) / 86_400_000;
  expect(daysLeft).toBeGreaterThan(6.99);
  expect(daysLeft).toBeLessThanOrEqual(7);
  expect((await listedInvitation(cookie, email))?.state).toBe("pending");
  expect(await (await lookUp(latestInvitationToken())).json()).toEqual({ email });

  await resendInvitation(cookie, bounced.id);

  expect((await listedInvitation(cookie, bouncedEmail))?.state).toBe("pending");
});

it("STD-4: resending an unknown, revoked or malformed id → 404", async () => {
  const { cookie } = await signedInAdmin();
  const { invitation } = await invitedBy(cookie, uniqueEmail());
  await setInvitationTimestamp(invitation.id, "revokedAt", "1 minute");
  outbox.sent = [];

  for (const id of [invitation.id, crypto.randomUUID(), "not-a-uuid"]) {
    const response = await resendInvitation(cookie, id);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { message: "Not found" } });
  }
  expect(outbox.sent).toEqual([]);
});