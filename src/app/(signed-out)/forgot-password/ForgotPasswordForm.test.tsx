import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { answering, done, pendingAction, refused, renderForm, sentFields } from "../../../test/forms";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

afterEach(cleanup);

function send(email: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send link" }));
}

it('REQ-050.1, STD-5: while sending, the button is disabled and reads "Sending…"; the action gets { email } and the page shows "Check your email" naming the email', async () => {
  const { act: requestResetLink, settle } = pendingAction();
  renderForm(<ForgotPasswordForm requestResetLink={requestResetLink} />);

  send("sam@acme.com");

  const button = await screen.findByRole("button", { name: "Sending…" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  await act(async () => settle(done));

  expect(screen.getByRole("heading", { name: "Check your email" })).toBeTruthy();
  expect(screen.getByText(/If sam@acme.com belongs to a Tracklite member/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe("/sign-in");
  expect(sentFields(requestResetLink)).toEqual({ email: "sam@acme.com" });
});

it('SEC-001.2: a limit refusal shows "Too many attempts. Try again later." beside the form', async () => {
  renderForm(
    <ForgotPasswordForm
      requestResetLink={answering(refused("limited", "Too many attempts. Try again later."))}
    />,
  );

  send("sam@acme.com");

  expect((await screen.findByRole("alert")).textContent).toContain("Too many attempts. Try again later.");
});

it('STD-6: a failed email shows the toast "We couldn’t send the email. Try again." and keeps the email', async () => {
  renderForm(
    <ForgotPasswordForm
      requestResetLink={answering(refused("unavailable", "We couldn’t send the email. Try again."))}
    />,
  );

  send("sam@acme.com");

  expect((await screen.findByRole("status")).textContent).toBe("We couldn’t send the email. Try again.");
  expect(screen.queryByRole("alert")).toBeNull();
  expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("sam@acme.com");
});