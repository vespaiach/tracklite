import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  admin,
  apiError,
  mockApi,
  noContent,
  renderAppAt,
  requestsTo,
  signedOut,
} from "../../test/client-app";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const secret = "a-setup-secret-of-at-least-32-characters";

function mockSetup(
  check: () => Response,
  create: () => Response = () => Response.json(admin, { status: 201 }),
) {
  let signedIn = false;
  return mockApi({
    "GET /api/me": () => (signedIn ? Response.json(admin) : signedOut()),
    "GET /api/setup": () => Response.json({ needed: !signedIn }),
    "POST /api/setup-checks": check,
    "POST /api/setup": () => {
      const response = create();
      signedIn = response.ok;
      return response;
    },
    "GET /api/my-issues": () => Response.json([]),
  });
}

async function enterSecret(value: string) {
  fireEvent.change(await screen.findByLabelText("Setup secret"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

function fillIn(fields: Record<string, string>) {
  for (const [label, value] of Object.entries(fields)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}

const profile = {
  Email: "owner@x.com",
  "Full name": "Sam Lee",
  Username: "Sam",
  Password: "correct horse battery",
};

it("OPS-001.1, REQ-048: the right secret opens the profile form; mismatched passwords and a 422's field errors are shown, then creating the admin lands on My issues", async () => {
  const answers = [apiError(422, "Check the highlighted fields", { username: "Username taken" })];
  const fetchMock = mockSetup(noContent, () => answers.shift() ?? Response.json(admin, { status: 201 }));
  renderAppAt("/welcome");

  expect(await screen.findByRole("heading", { name: "Welcome to Tracklite" })).toBeTruthy();
  await enterSecret(secret);

  expect(await screen.findByRole("heading", { name: "Create the first admin" })).toBeTruthy();
  fillIn({ ...profile, "Confirm password": "something else entirely" });
  fireEvent.click(screen.getByRole("button", { name: "Create admin" }));
  expect(await screen.findByText("Passwords don’t match")).toBeTruthy();
  expect(requestsTo(fetchMock, "POST /api/setup")).toEqual([]);

  fillIn({ "Confirm password": profile.Password });
  fireEvent.click(screen.getByRole("button", { name: "Create admin" }));
  expect(await screen.findByText("Username taken")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Create admin" }));

  expect(await screen.findByRole("heading", { name: "My issues" })).toBeTruthy();
  expect(window.location.pathname).toBe("/my-issues");
  expect(requestsTo(fetchMock, "POST /api/setup-checks")).toEqual([{ secret }]);
  expect(requestsTo(fetchMock, "POST /api/setup")[1]).toEqual({
    secret,
    email: "owner@x.com",
    fullName: "Sam Lee",
    username: "Sam",
    password: "correct horse battery",
  });
});

it("OPS-001.2: once setup is no longer needed, /welcome goes to sign-in", async () => {
  mockApi({
    "GET /api/me": signedOut,
    "GET /api/setup": () => Response.json({ needed: false }),
  });
  renderAppAt("/welcome");

  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
  expect(window.location.pathname).toBe("/sign-in");
});

it("OPS-001.3, OPS-001.4: a refused secret shows the server's message and keeps the profile fields hidden", async () => {
  const answers = [
    apiError(403, "Wrong setup secret"),
    apiError(503, "Setup isn't enabled. Set SETUP_SECRET on the server and restart."),
  ];
  mockSetup(() => answers.shift() ?? noContent());
  renderAppAt("/welcome");

  await enterSecret("not-the-right-secret-but-long-enough");
  expect((await screen.findByRole("alert")).textContent).toContain("Wrong setup secret");
  expect(screen.queryByLabelText("Email")).toBeNull();

  await enterSecret(secret);
  expect(
    await screen.findByText("Setup isn't enabled. Set SETUP_SECRET on the server and restart."),
  ).toBeTruthy();
  expect(screen.queryByLabelText("Email")).toBeNull();
});