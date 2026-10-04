import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../server/db";
import { outbox } from "../../../server/email/outbox";
import { passwordResetEmail } from "../../../server/email/templates";
import { passwordResetRequests, passwordResetTokens } from "../../../server/schema";
import { createMember } from "../../../test/factories";
import { requestResetLink, uniqueIp } from "../../../test/reset-links";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  outbox.sent = [];
  outbox.failing = false;
});

afterEach(() => {
  vi.restoreAllMocks();
  outbox.failing = false;
});

const tooMany = { error: { message: "Too many attempts. Try again later." } };

async function expectLimited(response: Response) {
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual(tooMany);
}

it("REQ-050.1: an active member's email gets a reset link", async () => {
  const sam = await createMember();

  const response = await requestResetLink(sam.email.toUpperCase());

  expect(response.status).toBe(204);
  expect(outbox.sent).toHaveLength(1);
  const [sent] = outbox.sent;
  const token = sent.text.match(/token=(\S+)/)?.[1] ?? "";
  expect(sent).toEqual({ to: sam.email, ...passwordResetEmail({ email: sam.email, token }) });
});

it("REQ-050.2: an unknown email gets the same 204 and no email", async () => {
  const response = await requestResetLink("stranger-050-2@x.com");

  expect(response.status).toBe(204);
  expect(outbox.sent).toEqual([]);
});

it("REQ-050: a deactivated member gets the same 204 and no email", async () => {
  const sam = await createMember({ deactivatedAt: new Date() });

  const response = await requestResetLink(sam.email);

  expect(response.status).toBe(204);
  expect(outbox.sent).toEqual([]);
});

it("SEC-001.2: a 6th reset request within an hour is refused and sends nothing", async () => {
  const sam = await createMember();
  for (let request = 0; request < 5; request++) {
    expect((await requestResetLink(sam.email)).status).toBe(204);
  }

  await expectLimited(await requestResetLink(sam.email));
  expect(outbox.sent).toHaveLength(5);
});

it("SEC-001.3: an unknown email requested 6 times gets the same limit message", async () => {
  for (let request = 0; request < 5; request++) {
    expect((await requestResetLink("stranger@x.com")).status).toBe(204);
  }

  await expectLimited(await requestResetLink("stranger@x.com"));
});

it("SEC-001: 20 reset requests from one IP block any email from that IP", async () => {
  const sam = await createMember();
  const ip = uniqueIp();
  await db
    .insert(passwordResetRequests)
    .values(Array.from({ length: 20 }, () => ({ email: "someone-else@x.com", ip })));

  await expectLimited(await requestResetLink(sam.email, { "X-Forwarded-For": ip }));
  expect(outbox.sent).toEqual([]);
});

it("STD-6: a failed reset email answers 503 and saves no link", async () => {
  const sam = await createMember();
  outbox.failing = true;

  const response = await requestResetLink(sam.email);

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: { message: "We couldn't send the email. Try again." } });
  expect(await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.memberId, sam.id))).toEqual(
    [],
  );
});