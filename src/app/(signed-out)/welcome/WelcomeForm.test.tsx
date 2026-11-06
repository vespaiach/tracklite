import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { answering, refused, renderForm, sentFields } from "../../../test/forms";
import { WelcomeForm } from "./WelcomeForm";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  router.replace.mockClear();
});

const secret = "s3tup-secret-that-is-long-enough-to-pass";

function enterSecret(value: string) {
  fireEvent.change(screen.getByLabelText("Setup secret"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

it("OPS-001.1, REQ-048: the right secret opens the profile form; mismatched passwords and the server's field errors are shown, then creating the admin goes to My issues", async () => {
  const createFirstAdmin = answering(
    refused("invalid", "Check the highlighted fields", {
      username: "Use 2 to 20 letters, digits or hyphens",
    }),
  );
  renderForm(
    <WelcomeForm
      checkSetupSecret={answering()}
      createFirstAdmin={createFirstAdmin}
    />,
  );

  enterSecret(secret);

  expect(await screen.findByRole("heading", { name: "Create the first admin" })).toBeTruthy();
  fill("Email", "owner@x.com");
  fill("Full name", "Sam Lee");
  fill("Username", "sam_lee");
  fill("Password", "correct horse battery");
  fill("Confirm password", "correct horse batterY");
  fireEvent.click(screen.getByRole("button", { name: "Create admin" }));

  expect(screen.getByText("Passwords don’t match")).toBeTruthy();
  expect(createFirstAdmin).not.toHaveBeenCalled();

  fill("Confirm password", "correct horse battery");
  fireEvent.click(screen.getByRole("button", { name: "Create admin" }));

  expect(await screen.findByText("Use 2 to 20 letters, digits or hyphens")).toBeTruthy();

  fill("Username", "sam");
  fireEvent.click(screen.getByRole("button", { name: "Create admin" }));

  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/my-issues"));
  expect(sentFields(createFirstAdmin, 1)).toEqual({
    secret,
    email: "owner@x.com",
    fullName: "Sam Lee",
    username: "sam",
    password: "correct horse battery",
  });
});

it("OPS-001.3, OPS-001.4: a refused secret shows the server's message and keeps the profile fields hidden", async () => {
  renderForm(
    <WelcomeForm
      checkSetupSecret={answering(
        refused("forbidden", "Wrong setup secret"),
        refused("unavailable", "Setup isn’t configured. Set SETUP_SECRET in the server config."),
      )}
      createFirstAdmin={answering()}
    />,
  );

  enterSecret("a-wrong-secret");

  expect((await screen.findByRole("alert")).textContent).toContain("Wrong setup secret");
  expect(screen.queryByLabelText("Email")).toBeNull();

  enterSecret(secret);

  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("SETUP_SECRET"));
  expect(screen.queryByLabelText("Email")).toBeNull();
});