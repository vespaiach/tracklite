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

const expired = () => apiError(410, "This link has expired");

function mockReset(lookup: () => Response | Promise<Response>, reset: () => Response | Promise<Response>) {
  let signedIn = false;
  return mockApi({
    "GET /api/me": () => (signedIn ? Response.json(sam) : signedOut()),
    "POST /api/password-reset-lookups": lookup,
    "POST /api/password-resets": async () => {
      const response = await reset();
      signedIn = response.ok;
      return response;
    },
  });
}

async function setPassword(password: string) {
  fireEvent.change(await screen.findByLabelText("New password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Set password" }));
}

it("REQ-050.3: a valid link shows the form; a valid password posts { token, password } and lands on My issues", async () => {
  const fetchMock = mockReset(noContent, noContent);
  renderAppAt("/reset-password?token=abc");

  expect(await screen.findByRole("heading", { name: "Set a new password" })).toBeTruthy();
  await setPassword("a much longer password");

  expect(await screen.findByRole("heading", { name: "My issues" })).toBeTruthy();
  expect(window.location.pathname).toBe("/my-issues");
  expect(requestsTo(fetchMock, "POST /api/password-reset-lookups")).toEqual([{ token: "abc" }]);
  expect(requestsTo(fetchMock, "POST /api/password-resets")).toEqual([
    { token: "abc", password: "a much longer password" },
  ]);
});

it('REQ-050.9: a link the lookup rejects (410) shows "This link has expired" with no password field, and Request a new link goes to /forgot-password', async () => {
  mockApi({
    "GET /api/me": signedOut,
    "POST /api/password-reset-lookups": expired,
  });
  renderAppAt("/reset-password?token=not-a-token");

  expect(await screen.findByRole("heading", { name: "This link has expired" })).toBeTruthy();
  expect(screen.queryByLabelText("New password")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Request a new link" }));

  expect(await screen.findByRole("button", { name: "Send link" })).toBeTruthy();
  expect(window.location.pathname).toBe("/forgot-password");
});

it('REQ-050.4: a 410 on submit switches to "This link has expired"', async () => {
  mockReset(noContent, expired);
  renderAppAt("/reset-password?token=abc");

  await setPassword("a much longer password");

  expect(await screen.findByRole("heading", { name: "This link has expired" })).toBeTruthy();
  expect(screen.queryByLabelText("New password")).toBeNull();
});

it('REQ-048: the server\'s field errors "At least 12 characters" and "Too long (max 128)" show under the field, and the password is kept', async () => {
  const answers = [
    apiError(422, "Check the highlighted fields", { password: "At least 12 characters" }),
    apiError(422, "Check the highlighted fields", { password: "Too long (max 128)" }),
  ];
  mockReset(noContent, () => answers.shift() ?? noContent());
  renderAppAt("/reset-password?token=abc");

  await setPassword("tracklite1");
  expect(await screen.findByText("At least 12 characters")).toBeTruthy();
  const input = screen.getByLabelText("New password") as HTMLInputElement;
  expect(input.value).toBe("tracklite1");
  expect(input.getAttribute("aria-invalid")).toBe("true");

  const tooLong = "a".repeat(129);
  await setPassword(tooLong);
  expect(await screen.findByText("Too long (max 128)")).toBeTruthy();
  expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe(tooLong);
});

it('STD-7: "Checking your link…" shows only after the lookup has been pending 300 ms', async () => {
  mockReset(never, noContent);
  renderAppAt("/reset-password?token=abc");

  await screen.findByText("Tracklite");
  expect(screen.queryByText("Checking your link…")).toBeNull();
  expect(await screen.findByText("Checking your link…")).toBeTruthy();
  expect(screen.queryByLabelText("New password")).toBeNull();
});

it('REQ-050.8: signed in as Alex Kim shows "You\'re signed in as Alex Kim. Sign out to reset a password." and never looks the link up', async () => {
  const fetchMock = mockApi({ "GET /api/me": () => Response.json(alex) });
  renderAppAt("/reset-password?token=abc");

  expect(await screen.findByText("You're signed in as Alex Kim. Sign out to reset a password.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  expect(screen.queryByLabelText("New password")).toBeNull();
  expect(requestsTo(fetchMock, "POST /api/password-reset-lookups")).toEqual([]);
});

it("REQ-050.8: after Sign out, the same valid link shows the form", async () => {
  let signedIn = true;
  const fetchMock = mockApi({
    "GET /api/me": () => (signedIn ? Response.json(alex) : signedOut()),
    "DELETE /api/sessions/current": () => {
      signedIn = false;
      return noContent();
    },
    "POST /api/password-reset-lookups": noContent,
  });
  renderAppAt("/reset-password?token=abc");

  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

  expect(await screen.findByRole("heading", { name: "Set a new password" })).toBeTruthy();
  expect(window.location.pathname).toBe("/reset-password");
  expect(requestsTo(fetchMock, "DELETE /api/sessions/current")).toHaveLength(1);
  expect(requestsTo(fetchMock, "POST /api/password-reset-lookups")).toEqual([{ token: "abc" }]);
});

it("STD-9.3: a network error on submit shows the toast and keeps the password", async () => {
  mockReset(noContent, networkError);
  renderAppAt("/reset-password?token=abc");

  await setPassword("a much longer password");

  expect((await screen.findByRole("status")).textContent).toBe("Couldn't save. Try again.");
  expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("a much longer password");
});