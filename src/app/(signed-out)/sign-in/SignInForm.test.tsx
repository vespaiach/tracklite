import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { answering, pendingAction, refused, renderForm, sentFields, done } from "../../../test/forms";
import { SignInForm } from "./SignInForm";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  router.replace.mockClear();
});

function signInAs(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

it('REQ-047.1, STD-5: Forgot password? links to /forgot-password; while signing in the button is disabled and reads "Signing in…", then the action gets { email, password } and the page goes to My issues', async () => {
  const { act: signIn, settle } = pendingAction();
  renderForm(
    <SignInForm
      next={null}
      signIn={signIn}
    />,
  );

  expect(screen.getByRole("link", { name: "Forgot password?" }).getAttribute("href")).toBe(
    "/forgot-password",
  );

  signInAs("sam@acme.com", "correct-horse-battery");

  const button = await screen.findByRole("button", { name: "Signing in…" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  await act(async () => settle(done));

  expect(router.replace).toHaveBeenCalledWith("/my-issues");
  expect(sentFields(signIn)).toEqual({ email: "sam@acme.com", password: "correct-horse-battery" });
});

it("REQ-047.5, SEC-009.1: signing in from ?next=/issue/WEB-42 goes there, and an off-site next goes to My issues", async () => {
  renderForm(
    <SignInForm
      next="/issue/WEB-42"
      signIn={answering()}
    />,
  );
  signInAs("sam@acme.com", "correct-horse-battery");
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/issue/WEB-42"));

  cleanup();
  renderForm(
    <SignInForm
      next="//evil.example"
      signIn={answering()}
    />,
  );
  signInAs("sam@acme.com", "correct-horse-battery");
  await waitFor(() => expect(router.replace).toHaveBeenLastCalledWith("/my-issues"));
});

it("REQ-047.2, SEC-001.1: a refusal shows the server's message in the form; the email is kept and the password cleared", async () => {
  renderForm(
    <SignInForm
      next={null}
      signIn={answering(
        refused("invalid", "Incorrect email or password."),
        refused("limited", "Too many attempts. Try again later."),
      )}
    />,
  );

  signInAs("sam@acme.com", "wrong-password-123");

  expect((await screen.findByRole("alert")).textContent).toContain("Incorrect email or password.");
  expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("sam@acme.com");
  expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");

  signInAs("sam@acme.com", "correct-horse-battery");

  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("Too many attempts. Try again later."),
  );
  expect(router.replace).not.toHaveBeenCalled();
});

it('STD-9.3: an action that throws shows the toast "Couldn’t save. Try again." and keeps both fields', async () => {
  renderForm(
    <SignInForm
      next={null}
      signIn={vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })}
    />,
  );

  signInAs("sam@acme.com", "correct-horse-battery");

  expect((await screen.findByRole("status")).textContent).toBe("Couldn’t save. Try again.");
  expect(screen.queryByRole("alert")).toBeNull();
  expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("sam@acme.com");
  expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("correct-horse-battery");
});