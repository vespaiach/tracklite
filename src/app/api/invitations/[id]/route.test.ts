import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { outbox } from "../../../../server/email/outbox";
import {
  invitedBy,
  listedInvitation,
  lookUp,
  revokeInvitation,
  signedIn,
  signedInAdmin,
  uniqueEmail,
} from "../../../../test/invitations";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  outbox.sent = [];
  outbox.failing = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("REQ-001.4: revoking Sam's invitation → the link stops working", async () => {
  const { cookie } = await signedInAdmin();
  const email = uniqueEmail();
  const { invitation, token } = await invitedBy(cookie, email);

  const response = await revokeInvitation(cookie, invitation.id);

  expect(response.status).toBe(204);
  const lookup = await lookUp(token);
  expect(lookup.status).toBe(410);
  expect(await lookup.json()).toEqual({ error: { message: "This invitation is no longer valid." } });
  expect(await listedInvitation(cookie, email)).toBeUndefined();
});

it("REQ-001.4: after revoking, the same email can be invited again", async () => {
  const { cookie } = await signedInAdmin();
  const email = uniqueEmail();
  const { invitation } = await invitedBy(cookie, email);
  await revokeInvitation(cookie, invitation.id);

  const again = await invitedBy(cookie, email);

  expect(again.invitation.id).not.toBe(invitation.id);
  expect(await (await lookUp(again.token)).json()).toEqual({ email });
});

it("STD-2: a member who isn't an admin can't revoke", async () => {
  const { cookie: adminCookie } = await signedInAdmin();
  const { cookie } = await signedIn();
  const { invitation, token } = await invitedBy(adminCookie, uniqueEmail());

  expect((await revokeInvitation(cookie, invitation.id)).status).toBe(403);
  expect((await lookUp(token)).status).toBe(200);
});

it("STD-4: revoking an unknown, already revoked or malformed id → 404", async () => {
  const { cookie } = await signedInAdmin();
  const { invitation } = await invitedBy(cookie, uniqueEmail());
  await revokeInvitation(cookie, invitation.id);

  for (const id of [invitation.id, crypto.randomUUID(), "not-a-uuid"]) {
    const response = await revokeInvitation(cookie, id);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { message: "Not found" } });
  }
});