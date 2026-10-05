import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
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

function mockSignIn(answer: () => Response | Promise<Response>) {
  let signedIn = false;
  return mockApi({
    "GET /api/me": () => (signedIn ? Response.json(sam) : signedOut()),
    "POST /api/sessions": async () => {
      const response = await answer();
      signedIn = response.ok;
      return response;
    },
  });
}

async function signInAs(email: string, password: string) {
  fireEvent.change(await screen.findByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

it("REQ-047.1: the right password posts { email, password } and lands on My issues", async () => {
  const fetchMock = mockSignIn(noContent);
  renderAppAt("/sign-in");

  await signInAs("sam@acme.com", "correct-horse-battery");

  expect(await screen.findByRole("heading", { name: "My issues" })).toBeTruthy();
  expect(window.location.pathname).toBe("/my-issues");
  expect(requestsTo(fetchMock, "POST /api/sessions")).toEqual([
    { email: "sam@acme.com", password: "correct-horse-battery" },
  ]);
});

it('REQ-047.2: a wrong password shows "Incorrect email or password.", keeps the email and clears the password', async () => {
  mockSignIn(() => apiError(422, "Incorrect email or password."));
  renderAppAt("/sign-in");

  await signInAs("sam@acme.com", "wrong-password-123");

  expect((await screen.findByRole("alert")).textContent).toContain("Incorrect email or password.");
  expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("sam@acme.com");
  expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
});

it("REQ-047.5: signing in from /sign-in?next=/issue/WEB-42 lands on /issue/WEB-42", async () => {
  mockSignIn(noContent);
  renderAppAt(`/sign-in?next=${encodeURIComponent("/issue/WEB-42")}`);

  await signInAs("sam@acme.com", "correct-horse-battery");

  await waitFor(() => expect(window.location.pathname).toBe("/issue/WEB-42"));
});

it("SEC-009.1: signing in with next=https://evil.example or //evil.example lands on My issues", async () => {
  for (const next of ["https://evil.example", "//evil.example"]) {
    mockSignIn(noContent);
    renderAppAt(`/sign-in?next=${encodeURIComponent(next)}`);

    await signInAs("sam@acme.com", "correct-horse-battery");

    expect(await screen.findByRole("heading", { name: "My issues" })).toBeTruthy();
    expect(window.location.pathname).toBe("/my-issues");
    cleanup();
  }
});

it('SEC-001.1: a 429 shows "Too many attempts. Try again later." beside the form', async () => {
  mockSignIn(() => apiError(429, "Too many attempts. Try again later."));
  renderAppAt("/sign-in");

  await signInAs("sam@acme.com", "correct-horse-battery");

  expect((await screen.findByRole("alert")).textContent).toContain("Too many attempts. Try again later.");
  expect(window.location.pathname).toBe("/sign-in");
});

it('STD-5: while signing in, the button is disabled and reads "Signing in…"', async () => {
  mockSignIn(never);
  renderAppAt("/sign-in");

  await signInAs("sam@acme.com", "correct-horse-battery");

  const button = await screen.findByRole("button", { name: "Signing in…" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
});

it('STD-9.3: a network error shows the toast "Couldn\'t save. Try again." and keeps both fields', async () => {
  mockSignIn(networkError);
  renderAppAt("/sign-in");

  await signInAs("sam@acme.com", "correct-horse-battery");

  expect((await screen.findByRole("status")).textContent).toBe("Couldn't save. Try again.");
  expect(screen.queryByRole("alert")).toBeNull();
  expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("sam@acme.com");
  expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("correct-horse-battery");
});

it("§6.1: a signed-in member opening /sign-in goes to /my-issues", async () => {
  mockApi({ "GET /api/me": () => Response.json(sam) });
  renderAppAt("/sign-in");

  expect(await screen.findByRole("heading", { name: "My issues" })).toBeTruthy();
  expect(window.location.pathname).toBe("/my-issues");
});

it("Sign in: Forgot password? links to /forgot-password", async () => {
  mockSignIn(noContent);
  renderAppAt("/sign-in");

  const link = await screen.findByRole("link", { name: "Forgot password?" });
  expect(link.getAttribute("href")).toBe("/forgot-password");
});