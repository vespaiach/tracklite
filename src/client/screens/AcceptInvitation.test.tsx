import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  alex,
  apiError,
  mockApi,
  networkError,
  never,
  noContent,
  renderAppAt,
  requestsTo,
  sam,
  signedOut,
} from "../../test/client-app";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const expiredMessage = "This invitation has expired. Ask an admin for a new one.";
const revokedMessage = "This invitation is no longer valid.";

const invitedSam = () => Response.json({ email: "sam@acme.com" });

function mockInvite(lookup: () => Response | Promise<Response>, accept: () => Response | Promise<Response>) {
  let signedIn = false;
  return mockApi({
    "GET /api/me": () => (signedIn ? Response.json(sam) : signedOut()),
    "POST /api/invitation-lookups": lookup,
    "POST /api/members": async () => {
      const response = await accept();
      signedIn = response.ok;
      return response;
    },
  });
}

const accepted = () => Response.json(sam, { status: 201 });

async function fillIn(fullName: string, username: string, password: string) {
  fireEvent.change(await screen.findByLabelText("Full name"), { target: { value: fullName } });
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
}

function join() {
  fireEvent.click(screen.getByRole("button", { name: "Join Tracklite" }));
}

function typedInto(label: string) {
  return (screen.getByLabelText(label) as HTMLInputElement).value;
}

it("REQ-002.1: a valid link shows the invited email read-only; joining posts the profile and lands on My issues", async () => {
  const fetchMock = mockInvite(invitedSam, accepted);
  renderAppAt("/invite?token=abc");

  expect(await screen.findByRole("heading", { name: "Join Tracklite" })).toBeTruthy();
  expect(window.location.pathname).toBe("/invite");
  expect(screen.getAllByText(/sam@acme\.com/).length).toBeGreaterThan(0);
  expect(screen.queryByDisplayValue("sam@acme.com")).toBeNull();

  await fillIn("Sam Lee", "sam", "correct horse battery");
  join();

  expect(await screen.findByRole("heading", { name: "My issues" })).toBeTruthy();
  expect(window.location.pathname).toBe("/my-issues");
  expect(requestsTo(fetchMock, "POST /api/invitation-lookups")).toEqual([{ token: "abc" }]);
  expect(requestsTo(fetchMock, "POST /api/members")).toEqual([
    { token: "abc", fullName: "Sam Lee", username: "sam", password: "correct horse battery" },
  ]);
});

it("REQ-002.2: a link the lookup rejects (410) shows the expired message and no form", async () => {
  mockInvite(() => apiError(410, expiredMessage), accepted);
  renderAppAt("/invite?token=old");

  expect(await screen.findByText(expiredMessage)).toBeTruthy();
  expect(screen.queryByLabelText("Full name")).toBeNull();
  expect(screen.queryByRole("button", { name: "Join Tracklite" })).toBeNull();
});

it("REQ-002.2: a 410 expired answer on submit replaces the form with the expired message", async () => {
  mockInvite(invitedSam, () => apiError(410, expiredMessage));
  renderAppAt("/invite?token=abc");

  await fillIn("Sam Lee", "sam", "correct horse battery");
  join();

  expect(await screen.findByText(expiredMessage)).toBeTruthy();
  expect(screen.queryByLabelText("Full name")).toBeNull();
});

it('REQ-002.4: a revoked invitation on submit shows "This invitation is no longer valid." and no form', async () => {
  mockInvite(invitedSam, () => apiError(410, revokedMessage));
  renderAppAt("/invite?token=abc");

  await fillIn("Sam Lee", "sam", "correct horse battery");
  join();

  expect(await screen.findByText(revokedMessage)).toBeTruthy();
  expect(screen.queryByLabelText("Full name")).toBeNull();
  expect(screen.queryByRole("button", { name: "Join Tracklite" })).toBeNull();
});

it('REQ-002.3: signed in as Alex Kim shows "You\'re signed in as Alex Kim. Sign out to accept this invitation." and never looks the link up', async () => {
  const fetchMock = mockApi({ "GET /api/me": () => Response.json(alex) });
  renderAppAt("/invite?token=abc");

  expect(
    await screen.findByText("You're signed in as Alex Kim. Sign out to accept this invitation."),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  expect(screen.queryByLabelText("Full name")).toBeNull();
  expect(requestsTo(fetchMock, "POST /api/invitation-lookups")).toEqual([]);
});

it("REQ-002.3: after Sign out, the same link shows the form", async () => {
  let signedIn = true;
  const fetchMock = mockApi({
    "GET /api/me": () => (signedIn ? Response.json(alex) : signedOut()),
    "DELETE /api/sessions/current": () => {
      signedIn = false;
      return noContent();
    },
    "POST /api/invitation-lookups": invitedSam,
  });
  renderAppAt("/invite?token=abc");

  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

  expect(await screen.findByRole("heading", { name: "Join Tracklite" })).toBeTruthy();
  expect(window.location.pathname).toBe("/invite");
  expect(requestsTo(fetchMock, "POST /api/invitation-lookups")).toEqual([{ token: "abc" }]);
});

it("STD-3: the server's field errors for name, username and password show beside each field, and everything typed is kept", async () => {
  mockInvite(invitedSam, () =>
    apiError(422, "Check the highlighted fields", {
      fullName: "Name required",
      username: "Use 2 to 20 letters, digits or hyphens",
      password: "At least 12 characters",
    }),
  );
  renderAppAt("/invite?token=abc");

  await fillIn("   ", "sam lee", "tracklite1");
  join();

  expect(await screen.findByText("Name required")).toBeTruthy();
  expect(screen.getByText("Use 2 to 20 letters, digits or hyphens")).toBeTruthy();
  expect(screen.getByText("At least 12 characters")).toBeTruthy();
  for (const label of ["Full name", "Username", "Password"]) {
    expect(screen.getByLabelText(label).getAttribute("aria-invalid")).toBe("true");
  }
  expect(typedInto("Full name")).toBe("   ");
  expect(typedInto("Username")).toBe("sam lee");
  expect(typedInto("Password")).toBe("tracklite1");
});

it('REQ-003.2: a taken username shows "Username taken" beside Username', async () => {
  mockInvite(invitedSam, () => apiError(422, "Check the highlighted fields", { username: "Username taken" }));
  renderAppAt("/invite?token=abc");

  await fillIn("Sam Lee", "sam", "correct horse battery");
  join();

  expect(await screen.findByText("Username taken")).toBeTruthy();
  expect(screen.getByLabelText("Username").getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByLabelText("Full name").getAttribute("aria-invalid")).toBeNull();
});

it("STD-5: Join Tracklite is disabled while saving", async () => {
  mockInvite(invitedSam, never);
  renderAppAt("/invite?token=abc");

  await fillIn("Sam Lee", "sam", "correct horse battery");
  join();

  const button = await screen.findByRole("button", { name: "Joining…" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
});

it('STD-7: "Checking your invitation…" shows only after the lookup has been pending 300 ms', async () => {
  mockInvite(never, accepted);
  renderAppAt("/invite?token=abc");

  await screen.findByText("Tracklite");
  expect(screen.queryByText("Checking your invitation…")).toBeNull();
  expect(await screen.findByText("Checking your invitation…")).toBeTruthy();
  expect(screen.queryByLabelText("Full name")).toBeNull();
});

it('STD-7: a failed lookup shows "Couldn\'t load this." and Retry looks the link up again', async () => {
  const answers = [() => apiError(500, "boom"), invitedSam];
  const fetchMock = mockInvite(() => (answers.shift() ?? invitedSam)(), accepted);
  renderAppAt("/invite?token=abc");

  expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));

  expect(await screen.findByRole("heading", { name: "Join Tracklite" })).toBeTruthy();
  expect(requestsTo(fetchMock, "POST /api/invitation-lookups")).toEqual([{ token: "abc" }, { token: "abc" }]);
});

it("STD-9.3: a network error on submit shows the toast and keeps what was typed", async () => {
  mockInvite(invitedSam, networkError);
  renderAppAt("/invite?token=abc");

  await fillIn("Sam Lee", "sam", "correct horse battery");
  join();

  expect((await screen.findByRole("status")).textContent).toBe("Couldn't save. Try again.");
  expect(typedInto("Full name")).toBe("Sam Lee");
  expect(typedInto("Username")).toBe("sam");
  expect(typedInto("Password")).toBe("correct horse battery");
});