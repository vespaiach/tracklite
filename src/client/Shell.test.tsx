import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  admin,
  alex,
  apiError,
  mockApi,
  never,
  noContent,
  project,
  renderAppAt,
  requestsTo,
  signedOut,
  summary,
} from "../test/client-app";
import type { Me, Project } from "./api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Answer = (body: unknown) => Response | Promise<Response>;

const api = project("API", "API");
const mobile = project("MOB", "Mobile");
const site = project("SITE", "Website");
const web = project("WEB", "Website");

function mockSidebar({
  me = admin,
  projects = [api, mobile, site, web],
  create,
}: {
  me?: Me;
  projects?: Project[];
  create?: Answer;
} = {}) {
  let active = projects;
  return mockApi({
    "GET /api/me": () => Response.json(me),
    "GET /api/projects?archived=false": () => Response.json(active.map(summary)),
    "POST /api/projects":
      create ??
      ((body) => {
        const { name, key } = body as { name: string; key: string };
        const created = project(key.toUpperCase(), name);
        active = [...active, created];
        return Response.json(created, { status: 201 });
      }),
    "GET /api/projects/BIL": () => Response.json(project("BIL", "Billing")),
  });
}

function sidebar() {
  return screen.findByRole("complementary");
}

async function projectLinks() {
  await within(await sidebar()).findByRole("link", { name: "API · API" });
  return within(await sidebar())
    .getAllByRole("link")
    .filter((link) => link.textContent?.includes(" · "));
}

async function openNewProject() {
  fireEvent.click(await screen.findByRole("button", { name: "New project" }));
  return screen.getByRole("dialog", { name: "New project" });
}

it("REQ-015.3: shows active projects as “Name · KEY” links in the order the API sorts them", async () => {
  mockSidebar();
  renderAppAt("/my-issues");

  const links = await projectLinks();

  expect(links.map((link) => link.textContent)).toEqual([
    "API · API",
    "Mobile · MOB",
    "Website · SITE",
    "Website · WEB",
  ]);
  expect(links[2].getAttribute("href")).toBe("/project/SITE");
});

it("STD-2: only admins see the New project button and the Members link", async () => {
  mockSidebar({ me: alex });
  renderAppAt("/my-issues");
  await projectLinks();
  expect(screen.queryByRole("button", { name: "New project" })).toBeNull();
  expect(within(await sidebar()).queryByRole("link", { name: "Members" })).toBeNull();
  cleanup();

  mockSidebar({ me: admin });
  renderAppAt("/my-issues");
  await projectLinks();
  expect(screen.getByRole("button", { name: "New project" })).toBeTruthy();
  expect(within(await sidebar()).getByRole("link", { name: "Members" })).toBeTruthy();
});

it("STD-7: with no active projects the sidebar says “No projects yet.”, offering admins “Create one.”", async () => {
  mockSidebar({ me: alex, projects: [] });
  renderAppAt("/my-issues");
  expect(await within(await sidebar()).findByText("No projects yet.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Create one." })).toBeNull();
  cleanup();

  mockSidebar({ me: admin, projects: [] });
  renderAppAt("/my-issues");
  fireEvent.click(await screen.findByRole("button", { name: "Create one." }));
  expect(screen.getByRole("dialog", { name: "New project" })).toBeTruthy();
});

it("REQ-009.1: an admin creates a project, lands on its board and sees it in the sidebar", async () => {
  const fetchMock = mockSidebar();
  renderAppAt("/my-issues");
  const dialog = await openNewProject();

  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Billing" } });
  fireEvent.change(within(dialog).getByLabelText("Key"), { target: { value: "bil" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

  expect(await within(await sidebar()).findByRole("link", { name: "Billing · BIL" })).toBeTruthy();
  expect(requestsTo(fetchMock, "POST /api/projects")).toEqual([{ name: "Billing", key: "bil" }]);
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(window.location.pathname).toBe("/project/BIL"));
});

it("REQ-009.3: server field errors show beside their fields and keep what was typed", async () => {
  mockSidebar({
    create: () =>
      apiError(422, "Check the highlighted fields", { name: "Name required", key: "Key already used" }),
  });
  renderAppAt("/my-issues");
  const dialog = await openNewProject();

  fireEvent.change(within(dialog).getByLabelText("Key"), { target: { value: "OLD" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

  expect(await within(dialog).findByText("Key already used")).toBeTruthy();
  expect(within(dialog).getByText("Name required")).toBeTruthy();
  expect((within(dialog).getByLabelText("Key") as HTMLInputElement).value).toBe("OLD");
  expect(within(dialog).getByLabelText("Key").getAttribute("aria-invalid")).toBe("true");
});

it("REQ-009.4: a key that isn't 2 to 5 letters shows the server's field error", async () => {
  mockSidebar({
    create: () => apiError(422, "Check the highlighted fields", { key: "Key must be 2 to 5 letters" }),
  });
  renderAppAt("/my-issues");
  const dialog = await openNewProject();

  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Website" } });
  fireEvent.change(within(dialog).getByLabelText("Key"), { target: { value: "W" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

  expect(await within(dialog).findByText("Key must be 2 to 5 letters")).toBeTruthy();
  expect((within(dialog).getByLabelText("Name") as HTMLInputElement).value).toBe("Website");
});

it("STD-5: Create is disabled while the project is saving", async () => {
  mockSidebar({ create: never });
  renderAppAt("/my-issues");
  const dialog = await openNewProject();

  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Billing" } });
  fireEvent.change(within(dialog).getByLabelText("Key"), { target: { value: "BIL" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

  const saving = await within(dialog).findByRole("button", { name: "Creating…" });
  expect((saving as HTMLButtonElement).disabled).toBe(true);
});

async function openMemberMenu() {
  fireEvent.click(await within(await sidebar()).findByRole("button", { name: "Sam Lee" }));
  return screen.findByRole("menu");
}

it("design §6.2: the bottom of the sidebar shows the signed-in member's initials and name", async () => {
  mockSidebar({ me: alex });
  renderAppAt("/my-issues");

  const trigger = await within(await sidebar()).findByRole("button", { name: "Alex Kim" });

  expect(trigger.textContent).toBe("AKAlex Kim");
  expect(trigger.getAttribute("aria-haspopup")).toBe("true");
});

it("design §6.2: Profile in the member menu goes to /settings/profile", async () => {
  mockSidebar();
  renderAppAt("/my-issues");

  const menu = await openMemberMenu();
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Profile" }));

  expect(await screen.findByRole("heading", { name: "Profile" })).toBeTruthy();
  expect(window.location.pathname).toBe("/settings/profile");
});

it("REQ-006: Sign out in the member menu ends the session and lands on /sign-in", async () => {
  let signedIn = true;
  const fetchMock = mockApi({
    "GET /api/me": () => (signedIn ? Response.json(admin) : signedOut()),
    "DELETE /api/sessions/current": () => {
      signedIn = false;
      return noContent();
    },
  });
  renderAppAt("/my-issues");

  const menu = await openMemberMenu();
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Sign out" }));

  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
  expect(requestsTo(fetchMock, "DELETE /api/sessions/current")).toEqual([undefined]);
  expect(window.location.pathname).toBe("/sign-in");
  expect(window.location.search).toBe("");
  expect(screen.queryByRole("complementary")).toBeNull();
});

it("design §6.2: the member menu closes on Escape and returns focus to its button", async () => {
  mockSidebar();
  renderAppAt("/my-issues");

  const menu = await openMemberMenu();
  await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
  fireEvent.keyDown(document.activeElement ?? menu, { key: "Escape" });

  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  await waitFor(() =>
    expect(document.activeElement).toBe(
      within(screen.getByRole("complementary")).getByRole("button", { name: "Sam Lee" }),
    ),
  );
});