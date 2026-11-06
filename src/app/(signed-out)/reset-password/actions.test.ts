import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { outbox } from "../../../infrastructure/email/outbox";
import { createSession } from "../../../infrastructure/identity/session";
import { hashPassword } from "../../../infrastructure/passwords";
import { fromNewIp, outcome, sessionCookieWritten, signInAs } from "../../../test/actions";
import { createMember } from "../../../test/factories";
import { ageResetLink, resetTokenFor } from "../../../test/reset-links";
import { GET as getMe } from "../../api/me/route";
import { resetPassword } from "./actions";

const oldPassword = "correct horse battery";
const newPassword = "a brand new password";
let oldPasswordHash: string;

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  outbox.sent = [];
  outbox.failing = false;
  oldPasswordHash ??= await hashPassword(oldPassword);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function reset(token: string, password = newPassword) {
  fromNewIp();
  return resetPassword({ token, password });
}

async function signInOutcome(email: string, password: string) {
  return outcome(await signInAs(email, password));
}

async function meStatus(cookie: string | undefined) {
  const response = await getMe(
    new Request("http://localhost:3000/api/me", { headers: cookie ? { Cookie: cookie } : {} }),
  );
  return response.status;
}

const expired = { ok: false, error: { kind: "expired", message: "This link has expired" } };

async function expectExpired(result: Promise<unknown>) {
  expect(await result).toEqual(expired);
  expect(sessionCookieWritten()).toBeUndefined();
}

it("REQ-050.3, REQ-050.4, REQ-050.6, REQ-050.7: a valid new password 10 minutes after sending is set, signs Sam in, ends the session on another computer, expires the earlier link and can't be reused", async () => {
  const sam = await createMember({ passwordHash: oldPasswordHash });
  const otherComputer = `session=${await createSession(sam.id)}`;
  const first = await resetTokenFor(sam.email);
  const token = await resetTokenFor(sam.email);
  await ageResetLink(token, "10 minutes");

  expect(await reset(token)).toEqual({ ok: true, data: null });

  expect(await meStatus(sessionCookieWritten())).toBe(200);
  expect(await meStatus(otherComputer)).toBe(401);
  expect(await signInOutcome(sam.email, oldPassword)).toBe("invalid");
  expect(await signInOutcome(sam.email, newPassword)).toBe("ok");
  await expectExpired(reset(first, "yet another new password"));
  await expectExpired(reset(token, "yet another new password"));
});

it("REQ-050.4: submitting after 31 minutes is refused and the password is unchanged", async () => {
  const sam = await createMember({ passwordHash: oldPasswordHash });
  const token = await resetTokenFor(sam.email);
  await ageResetLink(token, "31 minutes");

  await expectExpired(reset(token));
  expect(await signInOutcome(sam.email, oldPassword)).toBe("ok");
});

it("REQ-048: a too-short new password gets a field error and leaves the link usable", async () => {
  const sam = await createMember();
  const token = await resetTokenFor(sam.email);

  expect(await reset(token, "Sh0rt!pass")).toMatchObject({
    ok: false,
    error: { kind: "invalid", fields: { password: "At least 12 characters" } },
  });
  expect(outcome(await reset(token))).toBe("ok");
});