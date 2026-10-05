import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { outbox } from "../../../server/email/outbox";
import {
  invitedBy,
  lookUp,
  setInvitationTimestamp,
  signedInAdmin,
  uniqueEmail,
} from "../../../test/invitations";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  outbox.sent = [];
  outbox.failing = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const expired = { error: { message: "This invitation has expired. Ask an admin for a new one." } };

async function expectExpired(response: Response) {
  expect(response.status).toBe(410);
  expect(await response.json()).toEqual(expired);
}

it("REQ-002.2: an unknown or malformed link has expired", async () => {
  await expectExpired(await lookUp("not-a-real-token"));
  await expectExpired(await lookUp(42));
});

it("REQ-002.2: a link opened on day 8 has expired", async () => {
  const { cookie } = await signedInAdmin();
  const { invitation, token } = await invitedBy(cookie, uniqueEmail());
  await setInvitationTimestamp(invitation.id, "expiresAt", "1 day");

  await expectExpired(await lookUp(token));
});

it("REQ-002.2: a link that was already accepted has expired", async () => {
  const { cookie } = await signedInAdmin();
  const { invitation, token } = await invitedBy(cookie, uniqueEmail());
  await setInvitationTimestamp(invitation.id, "acceptedAt", "1 minute");

  await expectExpired(await lookUp(token));
});

it("REQ-002: a valid link answers its email and isn't used up by looking", async () => {
  const { cookie } = await signedInAdmin();
  const email = uniqueEmail();
  const { token } = await invitedBy(cookie, email);

  for (let lookup = 0; lookup < 2; lookup++) {
    const response = await lookUp(token);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email });
  }
});