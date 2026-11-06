import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ActionResult, Invitation, Me } from "../../../../contract";
import { alex, sam } from "../../../../test/client-app";
import { refused, renderForm, sentFields } from "../../../../test/forms";
import { Members, type MembersActions } from "./Members";

afterEach(cleanup);

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
const sendFailed = "We couldn’t send the email. Try again.";

function ok<Data>(data: Data): ActionResult<Data> {
  return { ok: true, data };
}

function renewed(open: Invitation) {
  return ok({ ...open, state: "pending" as const, expiresAt: "2026-10-12T10:00:00.000Z" });
}

function stubActions(overrides: Partial<MembersActions> = {}) {
  return {
    createInvitation: vi.fn(async (form: FormData) =>
      ok(invitation("inv-new", String(form.get("email")), "pending", "2026-10-12T10:00:00.000Z")),
    ),
    resendInvitation: vi.fn(async ({ id }: { id: string }) =>
      renewed([priya, dev, lee].find((open) => open.id === id) ?? priya),
    ),
    revokeInvitation: vi.fn(async () => ok(null)),
    updateMember: vi.fn(async () => ok(null)),
    ...overrides,
  };
}

function renderMembers({
  invitations = [priya, dev, lee],
  members = [alex, jo, admin],
  ...overrides
}: Partial<MembersActions> & { invitations?: Invitation[]; members?: Me[] } = {}) {
  const actions = stubActions(overrides);
  const view = renderForm(
    <Members
      you="sam"
      members={members}
      invitations={invitations}
      {...actions}
    />,
  );
  return { ...actions, view };
}

function table(name: string) {
  return screen.getByRole("table", { name });
}

function row(tableName: string, text: string | RegExp) {
  const rows = within(table(tableName)).getAllByRole("row");
  const found = rows.find((candidate) => within(candidate).queryByText(text));
  if (!found) throw new Error(`No row in ${tableName} with ${text}`);
  return found;
}

function emailField() {
  return screen.getByLabelText("Email") as HTMLInputElement;
}

function invite(email: string) {
  fireEvent.change(emailField(), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
}

async function openMenu(name: string) {
  fireEvent.click(screen.getByRole("button", { name: `Actions for ${name}` }));
  return screen.findByRole("menu");
}

async function choose(name: string, action: string) {
  const menu = await openMenu(name);
  fireEvent.click(within(menu).getByRole("menuitem", { name: action }));
}

function section(name: string) {
  return screen.getByRole("region", { name: new RegExp(`^${name}`) });
}

function menuItems(menu: HTMLElement) {
  return within(menu)
    .getAllByRole("menuitem")
    .map((item) => item.textContent);
}

it('REQ-051.1, REQ-051: an admin sees Members then Invitations with counts, every member with their role, "(you)" and "(deactivated)" in the name, a Pending invitation with Resend and Revoke… in its menu, and Expired and Bounced ones with Resend beside the menu', async () => {
  renderMembers();

  const samRow = row("Members", /Sam Lee/);
  const [membersHead, invitationsHead] = screen.getAllByRole("heading", { level: 2 });
  expect(membersHead.textContent).toBe("Members3");
  expect(invitationsHead.textContent).toBe("Invitations3");
  expect(within(section("Invitations")).getByLabelText("Email")).toBeTruthy();
  expect(within(table("Members")).queryByRole("columnheader", { name: "Status" })).toBeNull();

  expect(within(samRow).getByText("(you)")).toBeTruthy();
  expect(within(samRow).getByText("sam")).toBeTruthy();
  expect(within(samRow).getByText("sam@acme.com")).toBeTruthy();
  expect(within(samRow).getByText("Admin")).toBeTruthy();
  const alexRow = row("Members", "Alex Kim");
  expect(within(alexRow).getByText("Member")).toBeTruthy();
  expect(within(alexRow).queryByText("(you)")).toBeNull();
  const joRow = row("Members", /Jo Park/);
  expect(within(joRow).getByText("Member")).toBeTruthy();
  expect(within(joRow).getByText(/\(deactivated\)/)).toBeTruthy();
  expect(within(joRow).queryByText("Deactivated")).toBeNull();

  const priyaRow = row("Invitations", "priya@acme.com");
  expect(within(priyaRow).getByText("Pending")).toBeTruthy();
  expect(within(priyaRow).getByText("Sam Lee")).toBeTruthy();
  expect(within(priyaRow).queryByRole("button", { name: "Resend invitation to priya@acme.com" })).toBeNull();
  expect(menuItems(await openMenu("priya@acme.com"))).toEqual(["Resend", "Revoke…"]);
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

  const devRow = row("Invitations", "dev@acme.com");
  expect(within(devRow).getByText("Bounced")).toBeTruthy();
  expect(within(devRow).getByRole("button", { name: "Resend invitation to dev@acme.com" })).toBeTruthy();
  const leeRow = row("Invitations", "lee@acme.com");
  expect(within(leeRow).getByText("Expired")).toBeTruthy();
  expect(within(leeRow).getByRole("button", { name: "Resend invitation to lee@acme.com" })).toBeTruthy();
  expect(menuItems(await openMenu("lee@acme.com"))).toEqual(["Revoke…"]);
});

it("REQ-053: the Invitations section links to Notification status", () => {
  renderMembers();

  const link = within(section("Invitations")).getByRole("link", { name: "Notification status" });
  expect(link.getAttribute("href")).toBe("/settings/notifications");
});

it("REQ-051.3, REQ-001: resending an expired invitation confirms it; a Pending one resends from its menu", async () => {
  const { resendInvitation } = renderMembers();

  fireEvent.click(screen.getByRole("button", { name: "Resend invitation to lee@acme.com" }));

  expect(await screen.findByText("Invitation resent to lee@acme.com.")).toBeTruthy();
  expect(resendInvitation).toHaveBeenLastCalledWith({ id: "inv-lee" });

  await choose("priya@acme.com", "Resend");

  expect(await screen.findByText("Invitation resent to priya@acme.com.")).toBeTruthy();
  expect(resendInvitation).toHaveBeenLastCalledWith({ id: "inv-priya" });
});

it("REQ-001.1, STD-5: Send invitation is disabled while sending, then sends the email, clears the field and confirms", async () => {
  let settle!: (result: ActionResult<Invitation>) => void;
  const createInvitation = vi.fn(
    (_form: FormData) =>
      new Promise<ActionResult<Invitation>>((resolve) => {
        settle = resolve;
      }),
  );
  renderMembers({ createInvitation });

  invite("nina@acme.com");

  const sending = await screen.findByRole("button", { name: "Sending…" });
  expect((sending as HTMLButtonElement).disabled).toBe(true);

  await act(async () =>
    settle(ok(invitation("inv-new", "nina@acme.com", "pending", "2026-10-12T10:00:00.000Z"))),
  );

  expect(await screen.findByText("Invitation sent to nina@acme.com.")).toBeTruthy();
  expect(emailField().value).toBe("");
  expect(sentFields(createInvitation)).toEqual({ email: "nina@acme.com" });
});

it("REQ-001, REQ-001.2, REQ-001.6: a refused email shows beside the field and keeps the text", async () => {
  const deactivatedMessage = "This person is deactivated. Reactivate them instead.";
  const refusals = [
    refused("invalid", "Check the highlighted fields", { email: "Enter a valid email" }),
    refused("invalid", "Already a member"),
    refused("invalid", deactivatedMessage),
  ] as ActionResult<Invitation>[];
  renderMembers({ createInvitation: vi.fn(async () => refusals.shift() as ActionResult<Invitation>) });

  invite("nina@acme");

  expect(await screen.findByText("Enter a valid email")).toBeTruthy();
  expect(emailField().getAttribute("aria-invalid")).toBe("true");
  expect(emailField().value).toBe("nina@acme");

  invite("Sam@Acme.com");

  expect(await screen.findByText("Already a member")).toBeTruthy();
  expect(emailField().getAttribute("aria-invalid")).toBe("true");
  expect(emailField().value).toBe("Sam@Acme.com");

  invite("jo@acme.com");

  expect(await screen.findByText(deactivatedMessage)).toBeTruthy();
  expect(emailField().getAttribute("aria-invalid")).toBe("true");
});

it("REQ-001.7: a failed send shows the STD-6 toast and keeps the address", async () => {
  renderMembers({
    createInvitation: vi.fn(async () => refused("unavailable", sendFailed) as ActionResult<Invitation>),
  });

  invite("nina@acme.com");

  expect(await screen.findByText(sendFailed)).toBeTruthy();
  expect(emailField().value).toBe("nina@acme.com");
  expect(emailField().getAttribute("aria-invalid")).not.toBe("true");
});

it("REQ-001.4: Revoke asks first; Cancel sends nothing; confirming revokes and closes the dialog", async () => {
  const { revokeInvitation } = renderMembers();

  await choose("priya@acme.com", "Revoke…");

  const cancelled = await screen.findByRole("dialog", { name: "Revoke invitation?" });
  expect(within(cancelled).getByText("The link sent to priya@acme.com will stop working.")).toBeTruthy();
  fireEvent.click(within(cancelled).getByRole("button", { name: "Cancel" }));

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(revokeInvitation).not.toHaveBeenCalled();

  await choose("priya@acme.com", "Revoke…");
  const dialog = await screen.findByRole("dialog", { name: "Revoke invitation?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Revoke invitation" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(revokeInvitation).toHaveBeenCalledExactlyOnceWith({ id: "inv-priya" });
});

it('REQ-007: Deactivate asks "Alex Kim will be signed out and can\'t sign in until reactivated."; Cancel sends nothing; confirming deactivates them', async () => {
  const { updateMember } = renderMembers();

  await choose("Alex Kim", "Deactivate");

  const cancelled = await screen.findByRole("dialog", { name: "Deactivate Alex Kim?" });
  expect(
    within(cancelled).getByText("Alex Kim will be signed out and can't sign in until reactivated."),
  ).toBeTruthy();
  fireEvent.click(within(cancelled).getByRole("button", { name: "Cancel" }));

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(updateMember).not.toHaveBeenCalled();

  await choose("Alex Kim", "Deactivate");
  const dialog = await screen.findByRole("dialog", { name: "Deactivate Alex Kim?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(updateMember).toHaveBeenCalledExactlyOnceWith({ username: "alex", deactivated: true });
});

it("REQ-008: Reactivate needs no confirmation and is a deactivated member's only action", async () => {
  const { updateMember } = renderMembers();

  const menu = await openMenu("Jo Park");
  expect(menuItems(menu)).toEqual(["Reactivate"]);
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Reactivate" }));

  await waitFor(() => expect(updateMember).toHaveBeenCalledWith({ username: "jo", deactivated: false }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("REQ-052: Make admin and Remove admin send the new role", async () => {
  const { updateMember } = renderMembers({ members: [alex, { ...jo, deactivated: false, role: "admin" }] });

  await choose("Alex Kim", "Make admin");
  await waitFor(() => expect(updateMember).toHaveBeenLastCalledWith({ username: "alex", role: "admin" }));

  await choose("Jo Park", "Remove admin");
  await waitFor(() => expect(updateMember).toHaveBeenLastCalledWith({ username: "jo", role: "member" }));
});

it('REQ-007.3, STD-9.3: the last-admin refusal shows "There must be at least one admin." as a toast, and a call that throws shows "Couldn’t save. Try again."', async () => {
  const updateMember = vi
    .fn()
    .mockResolvedValueOnce(refused("invalid", lastAdmin))
    .mockRejectedValueOnce(new Error("Network down"));
  renderMembers({ updateMember });

  await choose("Sam Lee", "Remove admin");

  expect(await screen.findByText(lastAdmin)).toBeTruthy();
  expect(within(row("Members", "Sam Lee")).getByText("Admin")).toBeTruthy();

  await choose("Sam Lee", "Remove admin");

  expect(await screen.findByText("Couldn’t save. Try again.")).toBeTruthy();
});

it("STD-7: with no open invitations, the empty state names the next action", () => {
  renderMembers({ invitations: [] });

  expect(screen.getByText("No open invitations. Invite someone by email above.")).toBeTruthy();
  expect(screen.queryByRole("table", { name: "Invitations" })).toBeNull();
});