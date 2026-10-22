import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Me } from "../api";
import { apiError, mockApi, never, noContent, renderAppAt, requestsTo, sam } from "../../test/client-app";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Answer = (body: unknown) => Response | Promise<Response>;

function mockProfile({ save, change = noContent }: { save?: Answer; change?: Answer } = {}) {
  let me: Me = sam;
  function rename(body: unknown) {
    me = { ...me, fullName: (body as { fullName: string }).fullName };
    return Response.json(me);
  }
  return mockApi({
    "GET /api/me": () => Response.json(me),
    "PATCH /api/me": save ?? rename,
    "PUT /api/me/password": change,
  });
}

function input(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

async function saveName(fullName: string) {
  fireEvent.change(await screen.findByLabelText("Full name"), { target: { value: fullName } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

async function changePassword(currentPassword: string, newPassword: string) {
  fireEvent.change(await screen.findByLabelText("Current password"), { target: { value: currentPassword } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: newPassword } });
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
}

it("REQ-003.3: full name is editable; username/email read-only; Save sends only the name, confirms, and the confirmation clears on the next edit", async () => {
  const fetchMock = mockProfile();
  renderAppAt("/settings/profile");

  expect(((await screen.findByLabelText("Full name")) as HTMLInputElement).value).toBe("Sam Lee");
  expect(screen.getByText("sam")).toBeTruthy();
  expect(screen.getByText("sam@acme.com")).toBeTruthy();
  expect(screen.getAllByRole("textbox")).toHaveLength(1);

  await saveName("Samuel Lee");

  expect(await screen.findByText("Name saved.")).toBeTruthy();
  expect(await within(screen.getByRole("main")).findByText("Samuel Lee")).toBeTruthy();
  expect(requestsTo(fetchMock, "PATCH /api/me")).toEqual([{ fullName: "Samuel Lee" }]);

  fireEvent.change(input("Full name"), { target: { value: "Samuel J Lee" } });

  expect(screen.queryByText("Name saved.")).toBeNull();
});

it("REQ-003: a full-name field error from the server shows beside the field and keeps the text", async () => {
  mockProfile({ save: () => apiError(422, "Check the highlighted fields", { fullName: "Name required" }) });
  renderAppAt("/settings/profile");

  await saveName("   ");

  expect(await screen.findByText("Name required")).toBeTruthy();
  expect(input("Full name").getAttribute("aria-invalid")).toBe("true");
  expect(input("Full name").value).toBe("   ");
  expect(screen.queryByText("Name saved.")).toBeNull();
});

it("STD-5: Save and Change password are disabled while their own request is in flight", async () => {
  mockProfile({ save: never, change: never });
  renderAppAt("/settings/profile");

  await saveName("Samuel Lee");
  const saving = await screen.findByRole("button", { name: "Saving…" });
  expect((saving as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Change password" }) as HTMLButtonElement).disabled).toBe(false);

  await changePassword("correct-horse-battery", "staple-lantern-orbit");
  expect((screen.getByRole("button", { name: "Changing…" }) as HTMLButtonElement).disabled).toBe(true);
});

it("STD-9.3: a failed name save or password change shows the toast and keeps what was typed", async () => {
  mockProfile({
    save: () => new Response(null, { status: 500 }),
    change: () => new Response(null, { status: 500 }),
  });
  renderAppAt("/settings/profile");

  await saveName("Samuel Lee");

  expect(await screen.findByText("Couldn't save. Try again.")).toBeTruthy();
  expect(input("Full name").value).toBe("Samuel Lee");
  expect(screen.queryByText("Name saved.")).toBeNull();
  const nameToast = screen.getByRole("status");

  await changePassword("correct-horse-battery", "staple-lantern-orbit");

  await waitFor(() => expect(screen.getByRole("status")).not.toBe(nameToast));
  expect(within(screen.getByRole("status")).getByText("Couldn't save. Try again.")).toBeTruthy();
  expect(input("Current password").value).toBe("correct-horse-battery");
  expect(input("New password").value).toBe("staple-lantern-orbit");
});

it("REQ-049.1: Change password sends both passwords, clears the fields and shows the REQ-049 message", async () => {
  const fetchMock = mockProfile();
  renderAppAt("/settings/profile");

  await changePassword("correct-horse-battery", "staple-lantern-orbit");

  expect(await screen.findByText("Password changed. You've been signed out everywhere else.")).toBeTruthy();
  expect(requestsTo(fetchMock, "PUT /api/me/password")).toEqual([
    { currentPassword: "correct-horse-battery", newPassword: "staple-lantern-orbit" },
  ]);
  expect(input("Current password").value).toBe("");
  expect(input("New password").value).toBe("");
});

it("REQ-049.2, REQ-048: server field errors show beside Current and New password and keep what was typed", async () => {
  mockProfile({
    change: () =>
      apiError(422, "Check the highlighted fields", {
        currentPassword: "Incorrect password",
        newPassword: "At least 12 characters",
      }),
  });
  renderAppAt("/settings/profile");

  await changePassword("wrong-horse-battery", "tracklite1");

  expect(await screen.findByText("Incorrect password")).toBeTruthy();
  expect(input("Current password").getAttribute("aria-invalid")).toBe("true");
  expect(input("Current password").value).toBe("wrong-horse-battery");
  expect(screen.getByText("At least 12 characters")).toBeTruthy();
  expect(input("New password").getAttribute("aria-invalid")).toBe("true");
  expect(input("New password").value).toBe("tracklite1");
  expect(screen.queryByText("Password changed. You've been signed out everywhere else.")).toBeNull();
});

it('REQ-049.3: "Too many attempts. Try again later." shows in the form, not as a toast', async () => {
  mockProfile({ change: () => apiError(429, "Too many attempts. Try again later.") });
  renderAppAt("/settings/profile");

  await changePassword("correct-horse-battery", "staple-lantern-orbit");

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Too many attempts. Try again later.");
  expect(alert.closest("form")).toBe(screen.getByRole("button", { name: "Change password" }).closest("form"));
  expect(screen.queryByRole("status")).toBeNull();
});