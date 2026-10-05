import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  alex,
  apiError,
  mockApi,
  never,
  noContent,
  renderAppAt,
  requestsTo,
  sam,
} from "../../test/client-app";
import type { Invitation, Me } from "../api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Answer = (body: unknown) => Response | Promise<Response>;

const admin: Me = { ...sam, role: "admin" };
const jo: Me = {
  username: "jo",
  fullName: "Jo Park",
  initials: "JP",
  deactivated: true,
  email: "jo@acme.com",
  role: "member",
};
const samSummary = { username: "sam", fullName: "Sam Lee", initials: "SL", deactivated: false };

function invitation(id: string, email: string, state: Invitation["state"], expiresAt: string): Invitation {
  return { id, email, state, expiresAt, invitedBy: samSummary };
}

const priya = invitation("inv-priya", "priya@acme.com", "pending", "2026-10-12T09:00:00.000Z");
const dev = invitation("inv-dev", "dev@acme.com", "bounced", "2026-10-10T09:00:00.000Z");
const lee = invitation("inv-lee", "lee@acme.com", "expired", "2026-09-30T09:00:00.000Z");

const lastAdmin = "There must be at least one admin.";
const sendFailed = "We couldn't send the email. Try again.";

type Overrides = {
  me?: Me;
  invitations?: Invitation[];
  listMembers?: Answer;
  invite?: Answer;
  patch?: Answer;
};

function mockMembersPage(overrides: Overrides = {}) {
  let members: Me[] = [alex, jo, admin];
  let invitations = overrides.invitations ?? [priya, dev, lee];

  function patchMember(username: string) {
    return (body: unknown) => {
      if (overrides.patch) return overrides.patch(body);
      const change = body as { role?: Me["role"]; deactivated?: boolean };
      members = members.map((member) => (member.username === username ? { ...member, ...change } : member));
      return Response.json(members.find((member) => member.username === username));
    };
  }

  function resend(id: string) {
    return () => {
      invitations = invitations.map((open) =>
        open.id === id ? { ...open, state: "pending" as const, expiresAt: "2026-10-12T10:00:00.000Z" } : open,
      );
      return Response.json(invitations.find((open) => open.id === id));
    };
  }

  function revoke(id: string) {
    return () => {
      invitations = invitations.filter((open) => open.id !== id);
      return noContent();
    };
  }

  return mockApi({
    "GET /api/me": () => Response.json(overrides.me ?? admin),
    "GET /api/members": overrides.listMembers ?? (() => Response.json(members)),
    "GET /api/invitations": () => Response.json(invitations),
    "POST /api/invitations":
      overrides.invite ??
      ((body) => {
        const created = invitation(
          "inv-new",
          (body as { email: string }).email,
          "pending",
          "2026-10-12T10:00:00.000Z",
        );
        invitations = [...invitations, created];
        return Response.json(created, { status: 201 });
      }),
    "POST /api/invitations/inv-lee/resend": resend("inv-lee"),
    "POST /api/invitations/inv-priya/resend": resend("inv-priya"),
    "DELETE /api/invitations/inv-priya": revoke("inv-priya"),
    "PATCH /api/members/alex": patchMember("alex"),
    "PATCH /api/members/jo": patchMember("jo"),
    "PATCH /api/members/sam": patchMember("sam"),
  });
}

async function table(name: string) {
  return screen.findByRole("table", { name });
}

async function row(tableName: string, text: string | RegExp) {
  const rows = within(await table(tableName)).getAllByRole("row");
  const found = rows.find((candidate) => within(candidate).queryByText(text));
  if (!found) throw new Error(`No row in ${tableName} with ${text}`);
  return found;
}

function emailField() {
  return screen.getByLabelText("Email") as HTMLInputElement;
}

async function invite(email: string) {
  fireEvent.change(await screen.findByLabelText("Email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
}

async function openMenu(fullName: string) {
  fireEvent.click(await screen.findByRole("button", { name: `Actions for ${fullName}` }));
  return screen.findByRole("menu");
}

async function choose(fullName: string, action: string) {
  const menu = await openMenu(fullName);
  fireEvent.click(within(menu).getByRole("menuitem", { name: action }));
}

it("REQ-051.1: an admin sees every member with their role, and Sam's pending invitation with Resend and Revoke", async () => {
  mockMembersPage();
  renderAppAt("/settings/members");

  const samRow = await row("Members", "Sam Lee");
  expect(within(samRow).getByText("sam")).toBeTruthy();
  expect(within(samRow).getByText("sam@acme.com")).toBeTruthy();
  expect(within(samRow).getByText("Admin")).toBeTruthy();
  expect(within(await row("Members", "Alex Kim")).getByText("Member")).toBeTruthy();
  expect(within(await row("Members", /Jo Park/)).getByText("Member")).toBeTruthy();

  const priyaRow = await row("Invitations", "priya@acme.com");
  expect(within(priyaRow).getByText("Pending")).toBeTruthy();
  expect(within(priyaRow).getByText("Sam Lee")).toBeTruthy();
  expect(within(priyaRow).getByRole("button", { name: "Resend invitation to priya@acme.com" })).toBeTruthy();
  expect(within(priyaRow).getByRole("button", { name: "Revoke invitation to priya@acme.com" })).toBeTruthy();
  expect(within(await row("Invitations", "dev@acme.com")).getByText("Bounced")).toBeTruthy();
  expect(within(await row("Invitations", "lee@acme.com")).getByText("Expired")).toBeTruthy();
});

it("REQ-051.2: a member who isn't an admin sees \"You don't have permission to do that.\"", async () => {
  const fetchMock = mockMembersPage({ me: alex });
  renderAppAt("/settings/members");

  expect(await screen.findByText("You don't have permission to do that.")).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.queryByLabelText("Email")).toBeNull();
  expect(requestsTo(fetchMock, "GET /api/invitations")).toEqual([]);
});

it("REQ-051.3: resending an expired invitation shows it as Pending", async () => {
  const fetchMock = mockMembersPage();
  renderAppAt("/settings/members");

  fireEvent.click(await screen.findByRole("button", { name: "Resend invitation to lee@acme.com" }));

  expect(await screen.findByText("Invitation resent to lee@acme.com.")).toBeTruthy();
  await waitFor(async () =>
    expect(within(await row("Invitations", "lee@acme.com")).getByText("Pending")).toBeTruthy(),
  );
  expect(requestsTo(fetchMock, "POST /api/invitations/inv-lee/resend")).toHaveLength(1);
});

it('REQ-051: deactivated members stay listed, marked "(deactivated)"', async () => {
  mockMembersPage();
  renderAppAt("/settings/members");

  const joRow = await row("Members", /Jo Park/);
  expect(within(joRow).getByText(/\(deactivated\)/)).toBeTruthy();
  expect(within(joRow).getByText("Deactivated")).toBeTruthy();
});

it("REQ-001.1: Send invitation posts the email and lists it as Pending", async () => {
  const fetchMock = mockMembersPage();
  renderAppAt("/settings/members");

  await invite("nina@acme.com");

  expect(await screen.findByText("Invitation sent to nina@acme.com.")).toBeTruthy();
  await waitFor(async () =>
    expect(within(await row("Invitations", "nina@acme.com")).getByText("Pending")).toBeTruthy(),
  );
  expect(emailField().value).toBe("");
  expect(requestsTo(fetchMock, "POST /api/invitations")).toEqual([{ email: "nina@acme.com" }]);
});

it('REQ-001: "Enter a valid email" shows beside the field and keeps the text', async () => {
  mockMembersPage({
    invite: () => apiError(422, "Check the highlighted fields", { email: "Enter a valid email" }),
  });
  renderAppAt("/settings/members");

  await invite("nina@acme");

  expect(await screen.findByText("Enter a valid email")).toBeTruthy();
  expect(emailField().getAttribute("aria-invalid")).toBe("true");
  expect(emailField().value).toBe("nina@acme");
});

it("REQ-001.2: an existing member's email is refused beside the field", async () => {
  mockMembersPage({ invite: () => apiError(422, "Already a member") });
  renderAppAt("/settings/members");

  await invite("Sam@Acme.com");

  expect(await screen.findByText("Already a member")).toBeTruthy();
  expect(emailField().getAttribute("aria-invalid")).toBe("true");
  expect(emailField().value).toBe("Sam@Acme.com");
});

it("REQ-001.6: a deactivated member's email is refused beside the field", async () => {
  const message = "This person is deactivated. Reactivate them instead.";
  mockMembersPage({ invite: () => apiError(422, message) });
  renderAppAt("/settings/members");

  await invite("jo@acme.com");

  expect(await screen.findByText(message)).toBeTruthy();
  expect(emailField().getAttribute("aria-invalid")).toBe("true");
});

it("REQ-001.7: a failed send shows the STD-6 toast, keeps the address and lists nothing", async () => {
  mockMembersPage({ invite: () => apiError(503, sendFailed) });
  renderAppAt("/settings/members");

  await invite("nina@acme.com");

  expect(await screen.findByText(sendFailed)).toBeTruthy();
  expect(emailField().value).toBe("nina@acme.com");
  expect(emailField().getAttribute("aria-invalid")).not.toBe("true");
  expect(screen.queryByText("nina@acme.com", { selector: "td" })).toBeNull();
});

it("STD-5: Send invitation is disabled while sending", async () => {
  mockMembersPage({ invite: never });
  renderAppAt("/settings/members");

  await invite("nina@acme.com");

  const sending = await screen.findByRole("button", { name: "Sending…" });
  expect((sending as HTMLButtonElement).disabled).toBe(true);
});

it("Revoke asks for confirmation; Cancel sends nothing", async () => {
  const fetchMock = mockMembersPage();
  renderAppAt("/settings/members");

  fireEvent.click(await screen.findByRole("button", { name: "Revoke invitation to priya@acme.com" }));

  const dialog = await screen.findByRole("dialog", { name: "Revoke invitation?" });
  expect(within(dialog).getByText("The link sent to priya@acme.com will stop working.")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(requestsTo(fetchMock, "DELETE /api/invitations/inv-priya")).toEqual([]);
  expect(await row("Invitations", "priya@acme.com")).toBeTruthy();
});

it("REQ-001.4: confirming Revoke revokes the invitation and removes its row", async () => {
  const fetchMock = mockMembersPage();
  renderAppAt("/settings/members");

  fireEvent.click(await screen.findByRole("button", { name: "Revoke invitation to priya@acme.com" }));
  const dialog = await screen.findByRole("dialog", { name: "Revoke invitation?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Revoke invitation" }));

  await waitFor(() => expect(screen.queryByText("priya@acme.com")).toBeNull());
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(requestsTo(fetchMock, "DELETE /api/invitations/inv-priya")).toHaveLength(1);
});

it('REQ-007: Deactivate asks "Alex Kim will be signed out and can\'t sign in until reactivated."; Cancel sends nothing', async () => {
  const fetchMock = mockMembersPage();
  renderAppAt("/settings/members");

  await choose("Alex Kim", "Deactivate");

  const dialog = await screen.findByRole("dialog", { name: "Deactivate Alex Kim?" });
  expect(
    within(dialog).getByText("Alex Kim will be signed out and can't sign in until reactivated."),
  ).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(requestsTo(fetchMock, "PATCH /api/members/alex")).toEqual([]);
});

it('REQ-007: confirming Deactivate deactivates the member and marks them "(deactivated)"', async () => {
  const fetchMock = mockMembersPage();
  renderAppAt("/settings/members");

  await choose("Alex Kim", "Deactivate");
  const dialog = await screen.findByRole("dialog", { name: "Deactivate Alex Kim?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));

  await waitFor(async () =>
    expect(within(await row("Members", /Alex Kim/)).getByText(/\(deactivated\)/)).toBeTruthy(),
  );
  expect(requestsTo(fetchMock, "PATCH /api/members/alex")).toEqual([{ deactivated: true }]);
});

it("REQ-008: Reactivate needs no confirmation and is a deactivated member's only action", async () => {
  const fetchMock = mockMembersPage();
  renderAppAt("/settings/members");

  const menu = await openMenu("Jo Park");
  expect(
    within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent),
  ).toEqual(["Reactivate"]);
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Reactivate" }));

  await waitFor(() =>
    expect(requestsTo(fetchMock, "PATCH /api/members/jo")).toEqual([{ deactivated: false }]),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("REQ-052: Make admin and Remove admin send the new role", async () => {
  const fetchMock = mockMembersPage();
  renderAppAt("/settings/members");

  await choose("Alex Kim", "Make admin");
  await waitFor(() => expect(requestsTo(fetchMock, "PATCH /api/members/alex")).toEqual([{ role: "admin" }]));
  await waitFor(async () => expect(within(await row("Members", "Alex Kim")).getByText("Admin")).toBeTruthy());

  await choose("Alex Kim", "Remove admin");
  await waitFor(() =>
    expect(requestsTo(fetchMock, "PATCH /api/members/alex")).toEqual([{ role: "admin" }, { role: "member" }]),
  );
});

it('REQ-007.3: the last-admin refusal shows "There must be at least one admin." as a toast', async () => {
  mockMembersPage({ patch: () => apiError(422, lastAdmin) });
  renderAppAt("/settings/members");

  await choose("Sam Lee", "Remove admin");

  expect(await screen.findByText(lastAdmin)).toBeTruthy();
  expect(within(await row("Members", "Sam Lee")).getByText("Admin")).toBeTruthy();
});

it('STD-7: a load failure shows "Couldn\'t load this." and Retry reloads', async () => {
  let fail = true;
  const fetchMock = mockMembersPage({
    listMembers: () => (fail ? apiError(500, "boom") : Response.json([alex, jo, admin])),
  });
  renderAppAt("/settings/members");

  expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));

  expect(await row("Members", "Alex Kim")).toBeTruthy();
  expect(requestsTo(fetchMock, "GET /api/members").length).toBeGreaterThanOrEqual(2);
});

it("STD-7: with no open invitations, the empty state names the next action", async () => {
  mockMembersPage({ invitations: [] });
  renderAppAt("/settings/members");

  expect(await screen.findByText("No open invitations. Invite someone by email above.")).toBeTruthy();
  expect(screen.queryByRole("table", { name: "Invitations" })).toBeNull();
});

it("the ⋯ menu closes on Escape and returns focus to ⋯", async () => {
  mockMembersPage();
  renderAppAt("/settings/members");

  const menu = await openMenu("Alex Kim");
  await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
  fireEvent.keyDown(document.activeElement ?? menu, { key: "Escape" });

  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Actions for Alex Kim" })),
  );
});