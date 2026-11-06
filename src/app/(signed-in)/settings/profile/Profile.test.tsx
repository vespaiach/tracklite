import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../../components/toast";
import type { FormAction, Me } from "../../../../contract";
import { sam } from "../../../../test/client-app";
import { answering, done, pendingAction, refused, renderForm, sentFields } from "../../../../test/forms";
import { Profile } from "./Profile";

afterEach(cleanup);

function renderProfile({
  me = sam,
  updateProfile = answering(),
  changePassword = answering(),
}: {
  me?: Me;
  updateProfile?: FormAction;
  changePassword?: FormAction;
} = {}) {
  const view = renderForm(
    <Profile
      me={me}
      updateProfile={updateProfile}
      changePassword={changePassword}
    />,
  );
  return view;
}

function saveButton() {
  return screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
}

function input(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function saveName(fullName: string) {
  fireEvent.change(input("Full name"), { target: { value: fullName } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

function changePassword(currentPassword: string, newPassword: string) {
  fireEvent.change(input("Current password"), { target: { value: currentPassword } });
  fireEvent.change(input("New password"), { target: { value: newPassword } });
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
}

it("REQ-003.3: under Account the full name is editable and username, email and role are read-only; Save is off until the name changes, sends only the name and confirms until the next edit", async () => {
  const updateProfile = answering();
  const { rerender } = renderProfile({ updateProfile });

  const account = screen.getByRole("region", { name: "Account" });
  expect((within(account).getByLabelText("Full name") as HTMLInputElement).value).toBe("Sam Lee");
  expect(within(account).getByText("sam")).toBeTruthy();
  expect(within(account).getByText("sam@acme.com")).toBeTruthy();
  expect(within(account).getByText("Role").nextElementSibling?.textContent).toBe("Member");
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(saveButton().disabled).toBe(true);

  saveName("Samuel Lee");

  expect(await screen.findByText("Name saved.")).toBeTruthy();
  expect(sentFields(updateProfile)).toEqual({ fullName: "Samuel Lee" });
  rerender(
    <ToastProvider>
      <Profile
        me={{ ...sam, fullName: "Samuel Lee" }}
        updateProfile={updateProfile}
        changePassword={answering()}
      />
    </ToastProvider>,
  );
  await waitFor(() => expect(saveButton().disabled).toBe(true));

  fireEvent.change(input("Full name"), { target: { value: "Samuel J Lee" } });

  expect(screen.queryByText("Name saved.")).toBeNull();
  expect(saveButton().disabled).toBe(false);
});

it("REQ-003: a full-name field error shows beside the field and keeps the text", async () => {
  renderProfile({
    updateProfile: answering(
      refused("invalid", "Check the highlighted fields", { fullName: "Name required" }),
    ),
  });

  saveName("   ");

  expect(await screen.findByText("Name required")).toBeTruthy();
  expect(input("Full name").getAttribute("aria-invalid")).toBe("true");
  expect(input("Full name").value).toBe("   ");
  expect(screen.queryByText("Name saved.")).toBeNull();
});

it("STD-5: Save and Change password are disabled while their own call is in flight", async () => {
  const saving = pendingAction();
  const changing = pendingAction();
  renderProfile({ updateProfile: saving.act, changePassword: changing.act });

  saveName("Samuel Lee");
  expect(((await screen.findByRole("button", { name: "Saving…" })) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Change password" }) as HTMLButtonElement).disabled).toBe(false);

  changePassword("correct-horse-battery", "staple-lantern-orbit");
  expect(((await screen.findByRole("button", { name: "Changing…" })) as HTMLButtonElement).disabled).toBe(
    true,
  );

  await act(async () => {
    saving.settle(done);
    changing.settle(done);
  });
});

it("STD-9.3: a failed name save or password change shows the toast and keeps what was typed", async () => {
  const failing = vi.fn(async () => {
    throw new Error("Network down");
  });
  renderProfile({ updateProfile: failing, changePassword: failing });

  saveName("Samuel Lee");

  expect(await screen.findByText("Couldn’t save. Try again.")).toBeTruthy();
  expect(input("Full name").value).toBe("Samuel Lee");
  expect(screen.queryByText("Name saved.")).toBeNull();

  changePassword("correct-horse-battery", "staple-lantern-orbit");

  await waitFor(() => expect(failing).toHaveBeenCalledTimes(2));
  expect(within(screen.getByRole("status")).getByText("Couldn’t save. Try again.")).toBeTruthy();
  expect(input("Current password").value).toBe("correct-horse-battery");
  expect(input("New password").value).toBe("staple-lantern-orbit");
});

it("REQ-049.1: Change password sends both passwords, clears the fields and shows the REQ-049 message beside the button", async () => {
  const change = answering();
  renderProfile({ changePassword: change });

  changePassword("correct-horse-battery", "staple-lantern-orbit");

  const changed = await screen.findByText("Password changed. You've been signed out everywhere else.");
  expect(changed.parentElement).toBe(screen.getByRole("button", { name: "Change password" }).parentElement);
  expect(sentFields(change)).toEqual({
    currentPassword: "correct-horse-battery",
    newPassword: "staple-lantern-orbit",
  });
  expect(input("Current password").value).toBe("");
  expect(input("New password").value).toBe("");
});

it("REQ-049.2, REQ-048: field errors show beside Current and New password and keep what was typed", async () => {
  renderProfile({
    changePassword: answering(
      refused("invalid", "Check the highlighted fields", {
        currentPassword: "Incorrect password",
        newPassword: "At least 12 characters",
      }),
    ),
  });

  changePassword("wrong-horse-battery", "tracklite1");

  expect(await screen.findByText("Incorrect password")).toBeTruthy();
  expect(input("Current password").getAttribute("aria-invalid")).toBe("true");
  expect(input("Current password").value).toBe("wrong-horse-battery");
  expect(screen.getByText("At least 12 characters")).toBeTruthy();
  expect(input("New password").getAttribute("aria-invalid")).toBe("true");
  expect(input("New password").value).toBe("tracklite1");
  expect(screen.queryByText("Password changed. You've been signed out everywhere else.")).toBeNull();
});

it('REQ-049.3: "Too many attempts. Try again later." shows in the form, not as a toast', async () => {
  renderProfile({ changePassword: answering(refused("limited", "Too many attempts. Try again later.")) });

  changePassword("correct-horse-battery", "staple-lantern-orbit");

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Too many attempts. Try again later.");
  expect(alert.closest("form")).toBe(screen.getByRole("button", { name: "Change password" }).closest("form"));
  expect(screen.queryByRole("status")).toBeNull();
});