import { beforeEach, expect, it } from "vitest";
import { outbox } from "../infrastructure/email/outbox";
import {
  invitedBy,
  listedInvitation,
  setInvitationTimestamp,
  signedInAdmin,
  uniqueEmail,
} from "../test/invitations";

beforeEach(() => {
  outbox.sent = [];
  outbox.failing = false;
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