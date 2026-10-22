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

it("REQ-002.2: an unknown, malformed, day-8 or already accepted link has expired", async () => {
  const { cookie } = await signedInAdmin();
  const dayEight = await invitedBy(cookie, uniqueEmail());
  await setInvitationTimestamp(dayEight.invitation.id, "expiresAt", "1 day");
  const accepted = await invitedBy(cookie, uniqueEmail());
  await setInvitationTimestamp(accepted.invitation.id, "acceptedAt", "1 minute");

  await expectExpired(await lookUp("not-a-real-token"));
  await expectExpired(await lookUp(42));
  await expectExpired(await lookUp(dayEight.token));
  await expectExpired(await lookUp(accepted.token));
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