import { sql } from "drizzle-orm";
import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../infrastructure/db";
import { outbox } from "../../infrastructure/email/outbox";
import { createSession, sessionCookieName } from "../../infrastructure/identity/session";
import { members } from "../../infrastructure/identity/tables";
import { createMember } from "../../test/factories";
import { invitedBy, setInvitationTimestamp, signedInAdmin, uniqueEmail } from "../../test/invitations";
import { setNextRequest } from "../../test/next-request";
import { ageResetLink, resetTokenFor } from "../../test/reset-links";
import { resetPassword } from "./reset-password/actions";
import ForgotPasswordPage from "./forgot-password/page";
import { AcceptInvitationForm, InvitationEnded } from "./invite/AcceptInvitationForm";
import InvitePage from "./invite/page";
import ResetPasswordPage from "./reset-password/page";
import { ResetLinkExpired, ResetPasswordForm } from "./reset-password/ResetPasswordForm";
import SignInPage from "./sign-in/page";
import { SignInForm } from "./sign-in/SignInForm";
import { SignOutPrompt } from "./SignOutPrompt";
import WelcomePage from "./welcome/page";
import { WelcomeForm } from "./welcome/WelcomeForm";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  outbox.sent = [];
  outbox.failing = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function query(params: Record<string, string> = {}) {
  return { params: Promise.resolve({}), searchParams: Promise.resolve(params) };
}

async function signedInAs(fullName = "Alex Kim") {
  const member = await createMember({ fullName });
  setNextRequest({ cookies: { [sessionCookieName()]: await createSession(member.id) } });
}

async function rendered(page: Promise<unknown>) {
  return (await page) as ReactElement<Record<string, unknown>>;
}

it("§1.7, §6.1: a signed-in member opening /sign-in or /forgot-password goes to /my-issues", async () => {
  await signedInAs();

  await expect(SignInPage(query())).rejects.toMatchObject({ url: "/my-issues" });
  await expect(ForgotPasswordPage()).rejects.toMatchObject({ url: "/my-issues" });
});

it("REQ-047.5: signed out, /sign-in shows the form with the next address it was given", async () => {
  await createMember();

  const page = await rendered(SignInPage(query({ next: "/issue/WEB-42" })));

  expect(page.type).toBe(SignInForm);
  expect(page.props.next).toBe("/issue/WEB-42");
  expect((await rendered(SignInPage(query()))).props.next).toBeNull();
});

it("OPS-001.5, OPS-001.2: on a fresh install /sign-in goes to /welcome, which shows the setup form; once a member exists /welcome goes to /sign-in", async () => {
  await db.execute(sql`truncate ${members} cascade`);

  await expect(SignInPage(query())).rejects.toMatchObject({ url: "/welcome" });
  expect((await rendered(WelcomePage())).type).toBe(WelcomeForm);

  await createMember();

  await expect(WelcomePage()).rejects.toMatchObject({ url: "/sign-in" });
});

it("REQ-050.8, REQ-002.3: signed in as Alex Kim, the reset and invitation pages ask to sign out first", async () => {
  await signedInAs("Alex Kim");

  const reset = await rendered(ResetPasswordPage(query({ token: "any" })));
  const invite = await rendered(InvitePage(query({ token: "any" })));

  expect(reset.type).toBe(SignOutPrompt);
  expect(reset.props.text).toBe("You're signed in as Alex Kim. Sign out to reset a password.");
  expect(invite.type).toBe(SignOutPrompt);
  expect(invite.props.text).toBe("You're signed in as Alex Kim. Sign out to accept this invitation.");
});

it("REQ-050.9, REQ-050.5: a malformed, missing or 31-minute-old reset link is expired; a valid one shows the form and opening it doesn't use it up", async () => {
  const sam = await createMember();
  const old = await resetTokenFor(sam.email);
  await ageResetLink(old, "31 minutes");
  const token = await resetTokenFor(sam.email);

  for (const params of [{ token: "not-a-real-token" }, {}, { token: old }] as Record<string, string>[]) {
    expect((await rendered(ResetPasswordPage(query(params)))).type).toBe(ResetLinkExpired);
  }
  for (let opened = 0; opened < 2; opened++) {
    const page = await rendered(ResetPasswordPage(query({ token })));
    expect(page.type).toBe(ResetPasswordForm);
    expect(page.props.token).toBe(token);
  }
  expect(await resetPassword({ token, password: "a brand new password" })).toEqual({ ok: true, data: null });
});

it("REQ-002.2, REQ-002: an unknown or day-8 invitation shows the expired message; a valid one shows the invited email and opening it doesn't use it up", async () => {
  const { cookie } = await signedInAdmin();
  const dayEight = await invitedBy(cookie, uniqueEmail());
  await setInvitationTimestamp(dayEight.invitation.id, "expiresAt", "1 day");
  const email = uniqueEmail();
  const { token } = await invitedBy(cookie, email);

  for (const params of [{ token: "not-a-real-token" }, { token: dayEight.token }]) {
    const page = await rendered(InvitePage(query(params)));
    expect(page.type).toBe(InvitationEnded);
    expect(page.props.message).toBe("This invitation has expired. Ask an admin for a new one.");
  }
  for (let opened = 0; opened < 2; opened++) {
    const page = await rendered(InvitePage(query({ token })));
    expect(page.type).toBe(AcceptInvitationForm);
    expect(page.props).toMatchObject({ token, email });
  }
});