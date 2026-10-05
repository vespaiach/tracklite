import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  apiError,
  mockApi,
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

function mockResetLink(answer: () => Response | Promise<Response>) {
  return mockApi({ "GET /api/me": signedOut, "POST /api/password-reset-links": answer });
}

async function sendLinkTo(email: string) {
  fireEvent.change(await screen.findByLabelText("Email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send link" }));
}

it('REQ-050.1: sending posts { email } and shows "Check your email" naming the email', async () => {
  const fetchMock = mockResetLink(noContent);
  renderAppAt("/forgot-password");

  await sendLinkTo("sam@acme.com");

  expect(await screen.findByRole("heading", { name: "Check your email" })).toBeTruthy();
  expect(screen.getByText(/sam@acme\.com/)).toBeTruthy();
  expect(screen.queryByLabelText("Email")).toBeNull();
  expect(requestsTo(fetchMock, "POST /api/password-reset-links")).toEqual([{ email: "sam@acme.com" }]);
});

it('SEC-001.2: a 429 shows "Too many attempts. Try again later." beside the form', async () => {
  mockResetLink(() => apiError(429, "Too many attempts. Try again later."));
  renderAppAt("/forgot-password");

  await sendLinkTo("sam@acme.com");

  expect((await screen.findByRole("alert")).textContent).toContain("Too many attempts. Try again later.");
  expect(screen.queryByRole("heading", { name: "Check your email" })).toBeNull();
});

it('STD-6: a failed email shows the toast "We couldn\'t send the email. Try again." and keeps the email', async () => {
  mockResetLink(() => apiError(503, "We couldn't send the email. Try again."));
  renderAppAt("/forgot-password");

  await sendLinkTo("sam@acme.com");

  expect((await screen.findByRole("status")).textContent).toBe("We couldn't send the email. Try again.");
  expect(screen.queryByRole("alert")).toBeNull();
  expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("sam@acme.com");
});

it('STD-5: while sending, the button is disabled and reads "Sending…"', async () => {
  mockResetLink(never);
  renderAppAt("/forgot-password");

  await sendLinkTo("sam@acme.com");

  const button = await screen.findByRole("button", { name: "Sending…" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
});

it("§6.1: a signed-in member opening /forgot-password goes to /my-issues", async () => {
  mockApi({ "GET /api/me": () => Response.json(sam) });
  renderAppAt("/forgot-password");

  expect(await screen.findByRole("heading", { name: "My issues" })).toBeTruthy();
  expect(window.location.pathname).toBe("/my-issues");
});