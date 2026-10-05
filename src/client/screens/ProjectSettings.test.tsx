import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  admin,
  alex,
  apiError,
  mockApi,
  noContent,
  project,
  renderAppAt,
  requestsTo,
  summary,
} from "../../test/client-app";
import type { Me, Project } from "../api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Answer = (body: unknown) => Response | Promise<Response>;

const web = project("WEB", "Website");
const old = project("OLD", "Old site", "2025-09-14T10:00:00.000Z");

function mockSettings({ me = admin, shown = web, patch }: { me?: Me; shown?: Project; patch?: Answer } = {}) {
  let current: Project | undefined = shown;
  return mockApi({
    "GET /api/me": () => Response.json(me),
    "GET /api/projects?archived=false": () =>
      Response.json(current && current.archivedAt === null ? [summary(current)] : []),
    [`GET /api/projects/${shown.key}`]: () => (current ? Response.json(current) : apiError(404, "Not found")),
    [`PATCH /api/projects/${shown.key}`]:
      patch ??
      ((body) => {
        const change = body as { name?: string; archived?: boolean };
        current = {
          ...(current as Project),
          ...(change.name !== undefined && { name: change.name }),
          ...(change.archived !== undefined && {
            archivedAt: change.archived ? "2026-10-05T10:00:00.000Z" : null,
          }),
        };
        return Response.json(current);
      }),
    [`DELETE /api/projects/${shown.key}`]: () => {
      current = undefined;
      return noContent();
    },
  });
}

function sidebar() {
  return screen.findByRole("complementary");
}

async function nameField() {
  return (await screen.findByLabelText("Name")) as HTMLInputElement;
}

async function openDelete() {
  fireEvent.click(await screen.findByRole("button", { name: "Delete project…" }));
  return screen.getByRole("dialog", { name: "Delete Website · WEB?" });
}

it("REQ-011.1: renaming a project keeps its key and updates the sidebar", async () => {
  const fetchMock = mockSettings();
  renderAppAt("/project/WEB/settings");

  fireEvent.change(await nameField(), { target: { value: "Marketing site" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Renamed to “Marketing site”.")).toBeTruthy();
  expect(requestsTo(fetchMock, "PATCH /api/projects/WEB")).toEqual([{ name: "Marketing site" }]);
  expect(await within(await sidebar()).findByRole("link", { name: "Marketing site · WEB" })).toBeTruthy();
  expect(screen.getByText("WEB", { selector: ".tl-fact__value--mono" })).toBeTruthy();
});

it("STD-3: a rename field error shows beside the name and keeps what was typed", async () => {
  mockSettings({ patch: () => apiError(422, "Check the highlighted fields", { name: "Name required" }) });
  renderAppAt("/project/WEB/settings");

  fireEvent.change(await nameField(), { target: { value: "   " } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Name required")).toBeTruthy();
  expect((await nameField()).value).toBe("   ");
  expect((await nameField()).getAttribute("aria-invalid")).toBe("true");
});

it("STD-9: a failed rename shows the toast and keeps the typed name", async () => {
  mockSettings({ patch: () => apiError(500, "Internal error") });
  renderAppAt("/project/WEB/settings");

  fireEvent.change(await nameField(), { target: { value: "Marketing site" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Couldn't save. Try again.")).toBeTruthy();
  expect((await nameField()).value).toBe("Marketing site");
});

it("REQ-013.1: archiving moves the project out of the sidebar and offers Unarchive", async () => {
  const fetchMock = mockSettings();
  renderAppAt("/project/WEB/settings");
  await within(await sidebar()).findByRole("link", { name: "Website · WEB" });

  fireEvent.click(await screen.findByRole("button", { name: "Archive project" }));

  expect(await screen.findByRole("button", { name: "Unarchive project" })).toBeTruthy();
  expect(requestsTo(fetchMock, "PATCH /api/projects/WEB")).toEqual([{ archived: true }]);
  await waitFor(() =>
    expect(
      within(screen.getByRole("complementary")).queryByRole("link", { name: "Website · WEB" }),
    ).toBeNull(),
  );
});

it("REQ-013.3: unarchiving puts the project back in the sidebar", async () => {
  const fetchMock = mockSettings({ shown: old });
  renderAppAt("/project/OLD/settings");

  fireEvent.click(await screen.findByRole("button", { name: "Unarchive project" }));

  expect(await within(await sidebar()).findByRole("link", { name: "Old site · OLD" })).toBeTruthy();
  expect(requestsTo(fetchMock, "PATCH /api/projects/OLD")).toEqual([{ archived: false }]);
  expect(await screen.findByRole("button", { name: "Archive project" })).toBeTruthy();
});

it("REQ-013.7: an archived project's settings show the name with no Save", async () => {
  mockSettings({ shown: old });
  renderAppAt("/project/OLD/settings");

  await screen.findByRole("button", { name: "Unarchive project" });
  expect(screen.getByText("Old site", { selector: ".tl-fact__value" })).toBeTruthy();
  expect(screen.queryByLabelText("Name")).toBeNull();
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
});

it("REQ-014.2: a key that doesn't match exactly keeps Delete disabled, with Cancel focused first", async () => {
  mockSettings();
  renderAppAt("/project/WEB/settings");
  const dialog = await openDelete();

  await waitFor(() =>
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" })),
  );
  const confirm = within(dialog).getByRole("button", { name: "Delete project" }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);

  fireEvent.change(within(dialog).getByLabelText("Type WEB to confirm"), { target: { value: "WEBB" } });
  expect(confirm.disabled).toBe(true);
  fireEvent.change(within(dialog).getByLabelText("Type WEB to confirm"), { target: { value: "web" } });
  expect(confirm.disabled).toBe(true);
});

it("REQ-014.1: typing the key exactly deletes the project and goes to My issues", async () => {
  const fetchMock = mockSettings();
  renderAppAt("/project/WEB/settings");
  await within(await sidebar()).findByRole("link", { name: "Website · WEB" });
  const dialog = await openDelete();

  fireEvent.change(within(dialog).getByLabelText("Type WEB to confirm"), { target: { value: "WEB" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete project" }));

  await waitFor(() => expect(window.location.pathname).toBe("/my-issues"));
  expect(requestsTo(fetchMock, "DELETE /api/projects/WEB")).toHaveLength(1);
  await waitFor(() =>
    expect(
      within(screen.getByRole("complementary")).queryByRole("link", { name: "Website · WEB" }),
    ).toBeNull(),
  );
});

it("STD-2: a member who opens project settings sees the permission message", async () => {
  mockSettings({ me: alex });
  renderAppAt("/project/WEB/settings");

  expect(await screen.findByText("You don't have permission to do that.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Delete project…" })).toBeNull();
});