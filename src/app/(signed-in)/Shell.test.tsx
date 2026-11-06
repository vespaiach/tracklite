import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useLeaveGuard } from "../../components/leave-guard";
import type { ActionResult, Me, ProjectSummary } from "../../contract";
import { loadPage } from "../../lib/load-page";
import { answering, done, pendingAction, refused, renderForm, sentFields } from "../../test/forms";
import { ProjectLinks, Shell } from "./Shell";

const navigation = vi.hoisted(() => ({ pathname: "/my-issues" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("../../lib/load-page", () => ({ loadPage: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onNavigate,
    ...props
  }: ComponentProps<"a"> & { href: string; onNavigate: (event: object) => void }) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onNavigate({ preventDefault: () => {} });
      }}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(loadPage).mockClear();
  navigation.pathname = "/my-issues";
});

const sam: Me = {
  username: "sam",
  fullName: "Sam Lee",
  initials: "SL",
  deactivated: false,
  email: "sam@acme.com",
  role: "member",
};
const admin: Me = { ...sam, role: "admin" };

const active: ProjectSummary[] = [
  { key: "API", name: "API", archivedAt: null },
  { key: "MOB", name: "Mobile", archivedAt: null },
  { key: "SITE", name: "Website", archivedAt: null },
  { key: "WEB", name: "Website", archivedAt: null },
];

type CreateResult = ActionResult<{ key: string }>;

function renderShell({
  me = admin,
  projects = active,
  archivedKeys = [],
  createProject = vi.fn(
    async (_form: FormData): Promise<CreateResult> => ({ ok: true, data: { key: "BIL" } }),
  ),
  signOut = answering(),
}: {
  me?: Me;
  projects?: ProjectSummary[];
  archivedKeys?: string[];
  createProject?: (form: FormData) => Promise<CreateResult>;
  signOut?: (form: FormData) => Promise<ActionResult<null>>;
} = {}) {
  renderForm(
    <Shell
      me={me}
      projects={
        <ProjectLinks
          projects={projects}
          archivedKeys={archivedKeys}
        />
      }
      createProject={createProject}
      signOut={signOut}>
      <h1>The page</h1>
    </Shell>,
  );
  return within(screen.getByRole("complementary", { name: "Sidebar" }));
}

function projectLinks(sidebar: ReturnType<typeof renderShell>) {
  return sidebar.getAllByRole("link").filter((link) => link.textContent?.includes(" · "));
}

function openNewProject() {
  fireEvent.click(screen.getByRole("button", { name: "New project" }));
  return within(screen.getByRole("dialog", { name: "New project" }));
}

function fillIn(dialog: ReturnType<typeof openNewProject>, name: string, key: string) {
  fireEvent.change(dialog.getByLabelText("Name"), { target: { value: name } });
  fireEvent.change(dialog.getByLabelText("Key"), { target: { value: key } });
  fireEvent.click(dialog.getByRole("button", { name: "Create" }));
}

it("REQ-015.3: shows the page beside active projects as “Name · KEY” links in the order given; the open project is current, ignoring capitals", () => {
  navigation.pathname = "/project/site/list";
  const sidebar = renderShell();

  const links = projectLinks(sidebar);

  expect(screen.getByRole("heading", { name: "The page" })).toBeTruthy();
  expect(links.map((link) => link.textContent)).toEqual([
    "API · API",
    "Mobile · MOB",
    "Website · SITE",
    "Website · WEB",
  ]);
  expect(links[2].getAttribute("href")).toBe("/project/SITE");
  expect(links[2].getAttribute("aria-current")).toBe("page");
  expect(links[3].hasAttribute("aria-current")).toBe(false);
  expect(sidebar.getByRole("link", { name: "My issues" }).hasAttribute("aria-current")).toBe(false);
});

it("STD-2, REQ-053, REQ-053.10: only admins see the New project button and the Members link, which is current on the notification status page; there is no Notifications link", () => {
  let sidebar = renderShell({ me: sam });
  expect(screen.queryByRole("button", { name: "New project" })).toBeNull();
  expect(sidebar.queryByRole("link", { name: "Members" })).toBeNull();
  expect(sidebar.getByRole("link", { name: "My issues" }).getAttribute("aria-current")).toBe("page");
  cleanup();

  navigation.pathname = "/settings/notifications";
  sidebar = renderShell({ me: admin });
  expect(screen.getByRole("button", { name: "New project" })).toBeTruthy();
  expect(sidebar.getByRole("link", { name: "Members" }).getAttribute("href")).toBe("/settings/members");
  expect(sidebar.getByRole("link", { name: "Members" }).getAttribute("aria-current")).toBe("page");
  expect(sidebar.queryByRole("link", { name: "Notifications" })).toBeNull();
});

it("REQ-013.1: Archived projects is current while viewing an archived project or one of its issues", async () => {
  const archivedLink = (sidebar: ReturnType<typeof renderShell>) =>
    sidebar.getByRole("link", { name: "Archived projects" });

  for (const pathname of ["/project/OLD", "/project/old/list", "/issue/OLD-1"]) {
    navigation.pathname = pathname;
    const sidebar = renderShell({ archivedKeys: ["OLD"] });
    await waitFor(() => expect(archivedLink(sidebar).getAttribute("aria-current")).toBe("page"));
    cleanup();
  }

  navigation.pathname = "/project/WEB";
  expect(archivedLink(renderShell({ archivedKeys: ["OLD"] })).hasAttribute("aria-current")).toBe(false);
});

it("STD-7: with no active projects the sidebar says “No projects yet.”, offering admins “Create one.”", () => {
  let sidebar = renderShell({ me: sam, projects: [] });
  expect(sidebar.getByText("No projects yet.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Create one." })).toBeNull();
  cleanup();

  sidebar = renderShell({ me: admin, projects: [] });
  fireEvent.click(sidebar.getByRole("button", { name: "Create one." }));
  expect(screen.getByRole("dialog", { name: "New project" })).toBeTruthy();
});

it("REQ-009.1, STD-5: while saving, Create is disabled and reads “Creating…”; then the action gets { name, key }, the dialog closes and the new project's board loads", async () => {
  const { act: createProject, settle } = pendingAction();
  renderShell({ createProject: createProject as unknown as (form: FormData) => Promise<CreateResult> });
  const dialog = openNewProject();

  fillIn(dialog, "Billing", "bil");

  const saving = await dialog.findByRole("button", { name: "Creating…" });
  expect((saving as HTMLButtonElement).disabled).toBe(true);
  await act(async () => settle({ ...done, data: { key: "BIL" } } as unknown as ActionResult<null>));

  expect(sentFields(createProject)).toEqual({ name: "Billing", key: "bil" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(loadPage).toHaveBeenCalledWith("/project/BIL");
});

it("REQ-009.3, REQ-009.4, STD-3: field errors show beside their fields and keep what was typed; any other refusal is a toast", async () => {
  const results: CreateResult[] = [
    refused("invalid", "Check the highlighted fields", {
      name: "Name required",
      key: "Key already used",
    }) as CreateResult,
    refused("invalid", "Check the highlighted fields", { key: "Key must be 2 to 5 letters" }) as CreateResult,
    refused("forbidden", "You don't have permission to do that.") as CreateResult,
  ];
  renderShell({ createProject: async () => results.shift() as CreateResult });
  const dialog = openNewProject();

  fillIn(dialog, "", "OLD");

  expect(await dialog.findByText("Key already used")).toBeTruthy();
  expect(dialog.getByText("Name required")).toBeTruthy();
  expect((dialog.getByLabelText("Key") as HTMLInputElement).value).toBe("OLD");
  expect(dialog.getByLabelText("Key").getAttribute("aria-invalid")).toBe("true");

  fillIn(dialog, "Website", "W");

  expect(await dialog.findByText("Key must be 2 to 5 letters")).toBeTruthy();
  expect(dialog.queryByText("Name required")).toBeNull();
  expect((dialog.getByLabelText("Name") as HTMLInputElement).value).toBe("Website");

  fillIn(dialog, "Website", "WEB");

  expect(await screen.findByText("You don't have permission to do that.")).toBeTruthy();
  expect(loadPage).not.toHaveBeenCalled();
});

it("design §6.2: the member button shows initials and name, and Profile loads /settings/profile", async () => {
  const sidebar = renderShell();

  const trigger = sidebar.getByRole("button", { name: "Sam Lee" });
  expect(trigger.textContent).toBe("SLSam Lee");
  expect(trigger.getAttribute("aria-haspopup")).toBe("true");

  fireEvent.click(trigger);
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Profile" }));

  expect(loadPage).toHaveBeenCalledWith("/settings/profile");
});

it("REQ-006, STD-9.3: Sign out in the member menu ends the session and loads /sign-in; a thrown call toasts and stays", async () => {
  const signOut = answering();
  let sidebar = renderShell({ signOut });

  fireEvent.click(sidebar.getByRole("button", { name: "Sam Lee" }));
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Sign out" }));

  await waitFor(() => expect(loadPage).toHaveBeenCalledWith("/sign-in"));
  expect(signOut).toHaveBeenCalledOnce();
  cleanup();
  vi.mocked(loadPage).mockClear();

  sidebar = renderShell({ signOut: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
  fireEvent.click(sidebar.getByRole("button", { name: "Sam Lee" }));
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Sign out" }));

  expect(await screen.findByText("Couldn’t save. Try again.")).toBeTruthy();
  expect(loadPage).not.toHaveBeenCalled();
});

const unsentComment = "You have an unsent comment. Leave anyway?";

function UnsentComment() {
  useLeaveGuard(unsentComment);
  return null;
}

it("REQ-035.1, REQ-035.3: with unsent text, another project, My issues, Profile and Sign out ask first, and Cancel stays", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const signOut = answering();
  const sidebar = renderShell({ signOut });
  render(<UnsentComment />);

  fireEvent.click(sidebar.getByRole("link", { name: "API · API" }));
  fireEvent.click(sidebar.getByRole("link", { name: "My issues" }));
  fireEvent.click(sidebar.getByRole("button", { name: "Sam Lee" }));
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Profile" }));
  fireEvent.click(sidebar.getByRole("button", { name: "Sam Lee" }));
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Sign out" }));

  expect(confirm.mock.calls).toEqual(Array(4).fill([unsentComment]));
  expect(loadPage).not.toHaveBeenCalled();
  expect(signOut).not.toHaveBeenCalled();
});