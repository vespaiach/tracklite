import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { answering, done, pendingAction, refused, renderForm, sentFields } from "../../../test/forms";
import { ResetPasswordForm } from "./ResetPasswordForm";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  router.replace.mockClear();
  window.history.replaceState(null, "", "/");
});

function setPassword(password: string) {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Set password" }));
}

it('REQ-050.3, STD-5, §4.2: the token leaves the address; Set password reads "Saving…" and is disabled while saving, then the action gets { token, password } and the page goes to My issues', async () => {
  window.history.replaceState(null, "", "/reset-password?token=abc123#top");
  const { act: resetPassword, settle } = pendingAction();
  renderForm(
    <ResetPasswordForm
      token="abc123"
      resetPassword={resetPassword}
    />,
  );

  expect(window.location.pathname + window.location.search + window.location.hash).toBe(
    "/reset-password#top",
  );

  setPassword("a brand new password");

  const button = await screen.findByRole("button", { name: "Saving…" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  await act(async () => settle(done));

  expect(router.replace).toHaveBeenCalledWith("/my-issues");
  expect(sentFields(resetPassword)).toEqual({ token: "abc123", password: "a brand new password" });
});

it('REQ-050.4: an expired refusal on submit switches to "This link has expired", whose link requests a new one', async () => {
  renderForm(
    <ResetPasswordForm
      token="abc123"
      resetPassword={answering(refused("expired", "This link has expired"))}
    />,
  );

  setPassword("a brand new password");

  expect(await screen.findByRole("heading", { name: "This link has expired" })).toBeTruthy();
  expect(screen.queryByLabelText("New password")).toBeNull();
  expect(screen.getByRole("link", { name: "Request a new link" }).getAttribute("href")).toBe(
    "/forgot-password",
  );
});

it('REQ-048: the server\'s field error "At least 12 characters" shows under the field, and the password is kept', async () => {
  renderForm(
    <ResetPasswordForm
      token="abc123"
      resetPassword={answering(
        refused("invalid", "Check the highlighted fields", { password: "At least 12 characters" }),
      )}
    />,
  );

  setPassword("Sh0rt!pass");

  expect(await screen.findByText("At least 12 characters")).toBeTruthy();
  expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("Sh0rt!pass");
  expect(router.replace).not.toHaveBeenCalled();
});