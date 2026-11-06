import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../infrastructure/db";
import { outbox } from "../../../infrastructure/email/outbox";
import { passwordResetEmail } from "../../../infrastructure/email/templates";
import { passwordResetRequests, passwordResetTokens } from "../../../infrastructure/identity/tables";
import { createMember } from "../../../test/factories";
import { setNextRequest } from "../../../test/next-request";
import { uniqueIp } from "../../../test/reset-links";
import { requestResetLink } from "./actions";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  outbox.sent = [];
  outbox.failing = false;
});

afterEach(() => {
  vi.restoreAllMocks();
  outbox.failing = false;
});

const sent = { ok: true, data: null };
const tooMany = { ok: false, error: { kind: "limited", message: "Too many attempts. Try again later." } };

function request(email: string, ip = uniqueIp()) {
  setNextRequest({ headers: { "x-forwarded-for": ip } });
  return requestResetLink({ email });
}

it("REQ-050.1: an active member's email gets a reset link", async () => {
  const sam = await createMember();

  expect(await request(sam.email.toUpperCase())).toEqual(sent);

  expect(outbox.sent).toHaveLength(1);
  const [email] = outbox.sent;
  const token = email.text.match(/token=(\S+)/)?.[1] ?? "";
  expect(email).toEqual({ to: sam.email, ...passwordResetEmail({ email: sam.email, token }) });
});

it("REQ-050.2, REQ-050: an unknown email or a deactivated member gets the same answer and no email", async () => {
  const jo = await createMember({ deactivatedAt: new Date() });

  for (const email of ["stranger-050-2@x.com", jo.email]) {
    expect(await request(email)).toEqual(sent);
  }
  expect(outbox.sent).toEqual([]);
});

it("SEC-001.2: a 6th reset request within an hour is refused and sends nothing", async () => {
  const sam = await createMember();
  for (let attempt = 0; attempt < 5; attempt++) {
    expect(await request(sam.email)).toEqual(sent);
  }

  expect(await request(sam.email)).toEqual(tooMany);
  expect(outbox.sent).toHaveLength(5);
});

it("SEC-001.3: an unknown email requested 6 times gets the same limit message", async () => {
  for (let attempt = 0; attempt < 5; attempt++) {
    expect(await request("stranger@x.com")).toEqual(sent);
  }

  expect(await request("stranger@x.com")).toEqual(tooMany);
});

it("SEC-001: 20 reset requests from one IP block any email from that IP", async () => {
  const sam = await createMember();
  const ip = uniqueIp();
  await db
    .insert(passwordResetRequests)
    .values(Array.from({ length: 20 }, () => ({ email: "someone-else@x.com", ip })));

  expect(await request(sam.email, ip)).toEqual(tooMany);
  expect(outbox.sent).toEqual([]);
});

it("STD-6: a failed reset email is refused as unavailable and saves no link", async () => {
  const sam = await createMember();
  outbox.failing = true;

  expect(await request(sam.email)).toEqual({
    ok: false,
    error: { kind: "unavailable", message: "We couldn’t send the email. Try again." },
  });
  expect(await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.memberId, sam.id))).toEqual(
    [],
  );
});