import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { answering, done, pendingAction, refused, renderForm, sentFields } from "../../../test/forms";
import { AcceptInvitationForm, InvitationEnded } from "./AcceptInvitationForm";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  router.replace.mockClear();
  window.history.replaceState(null, "", "/");
});

function fillIn(profile: { fullName: string; username: string; password: string }) {
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: profile.fullName } });
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: profile.username } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: profile.password } });
  fireEvent.click(screen.getByRole("button", { name: "Join Tracklite" }));
}

const sam = { fullName: "Sam Lee", username: "sam", password: "correct horse battery" };

it("REQ-002.1, STD-5, §4.2: the invited email shows read-only and the token leaves the address; Join Tracklite is disabled while saving, then the action gets the profile and the page goes to My issues", async () => {
  window.history.replaceState(null, "", "/invite?token=abc123");
  const { act: acceptInvitation, settle } = pendingAction();
  renderForm(
    <AcceptInvitationForm
      token="abc123"
      email="sam@acme.com"
      acceptInvitation={acceptInvitation}
    />,
  );

  expect(window.location.search).toBe("");
  expect(
    screen.getByText("You're invited as sam@acme.com. Your username and email can't be changed later."),
  ).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Email" })).toBeNull();

  fillIn(sam);

  const button = await screen.findByRole("button", { name: "Joining…" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  await act(async () => settle(done));

  expect(router.replace).toHaveBeenCalledWith("/my-issues");
  expect(sentFields(acceptInvitation)).toEqual({ token: "abc123", ...sam });
});

it("REQ-002.2, REQ-002.4: an ended invitation shows the server's message as a title plus body, also when it ends on submit", async () => {
  renderForm(<InvitationEnded message="This invitation has expired. Ask an admin for a new one." />);

  expect(screen.getByRole("heading", { name: "This invitation has expired." })).toBeTruthy();
  expect(screen.getByText("Ask an admin for a new one.")).toBeTruthy();

  cleanup();
  renderForm(
    <AcceptInvitationForm
      token="abc123"
      email="sam@acme.com"
      acceptInvitation={answering(refused("expired", "This invitation is no longer valid."))}
    />,
  );

  fillIn(sam);

  expect(await screen.findByRole("heading", { name: "This invitation is no longer valid." })).toBeTruthy();
  expect(screen.queryByLabelText("Full name")).toBeNull();
});

it("STD-3, REQ-003.2: the server's field errors for name, username and password show beside each field, and everything typed is kept", async () => {
  renderForm(
    <AcceptInvitationForm
      token="abc123"
      email="sam@acme.com"
      acceptInvitation={answering(
        refused("invalid", "Check the highlighted fields", {
          fullName: "Name required",
          username: "Username taken",
          password: "At least 12 characters",
        }),
      )}
    />,
  );

  fillIn({ fullName: "Sam", username: "sam", password: "short" });

  expect(await screen.findByText("Username taken")).toBeTruthy();
  expect(screen.getByText("Name required")).toBeTruthy();
  expect(screen.getByText("At least 12 characters")).toBeTruthy();
  expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe("Sam");
  expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("sam");
  expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("short");
});