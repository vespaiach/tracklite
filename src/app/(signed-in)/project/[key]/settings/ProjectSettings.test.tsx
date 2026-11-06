import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ActionResult, ProjectSummary } from "../../../../../contract";
import { loadPage } from "../../../../../lib/load-page";
import { done, refused, renderForm, sentFields } from "../../../../../test/forms";
import { ProjectSettings, type ProjectSettingsActions } from "./ProjectSettings";

vi.mock("../../../../../lib/load-page", () => ({ loadPage: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(loadPage).mockClear();
});

const web: ProjectSummary = { key: "WEB", name: "Website", archivedAt: null };
const archivedWeb: ProjectSummary = { ...web, archivedAt: "2026-10-05T10:00:00.000Z" };

function renamedTo(name: string): ActionResult<{ name: string }> {
  return { ok: true, data: { name } };
}

function renderSettings({
  project = web,
  ...overrides
}: Partial<ProjectSettingsActions> & { project?: ProjectSummary } = {}) {
  const actions = {
    renameProject: vi.fn(async (form: FormData) => renamedTo(String(form.get("name")).trim())),
    archiveProject: vi.fn(async () => done),
    deleteProject: vi.fn(async () => done),
    ...overrides,
  };
  const view = renderForm(
    <ProjectSettings
      project={project}
      {...actions}
    />,
  );
  return { ...actions, view };
}

function nameField() {
  return screen.getByLabelText("Name") as HTMLInputElement;
}

function openDelete() {
  fireEvent.click(screen.getByRole("button", { name: "Delete project…" }));
  return screen.getByRole("dialog", { name: "Delete Website · WEB?" });
}

it("REQ-011.1: renaming a project sends its key and the new name, shows the saved name and keeps the key", async () => {
  const { renameProject } = renderSettings();

  fireEvent.change(nameField(), { target: { value: "  Marketing site " } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Saved.")).toBeTruthy();
  expect(sentFields(vi.mocked(renameProject))).toEqual({ key: "WEB", name: "  Marketing site " });
  expect(nameField().value).toBe("Marketing site");
  expect(screen.getByText("WEB", { selector: ".tl-fact__value--mono" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Website · WEB" }).getAttribute("href")).toBe("/project/WEB");
});

it("STD-3: a rename field error shows beside the name and keeps what was typed", async () => {
  renderSettings({
    renameProject: vi.fn(async () =>
      refused<{ name: string }>("invalid", "Check the highlighted fields", { name: "Name required" }),
    ),
  });

  fireEvent.change(nameField(), { target: { value: "   " } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Name required")).toBeTruthy();
  expect(nameField().value).toBe("   ");
  expect(nameField().getAttribute("aria-invalid")).toBe("true");
});

it("STD-9: a failed rename shows the toast and keeps the typed name", async () => {
  renderSettings({
    renameProject: vi.fn(async () => {
      throw new Error("Internal error");
    }),
  });

  fireEvent.change(nameField(), { target: { value: "Marketing site" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Couldn’t save. Try again.")).toBeTruthy();
  expect(nameField().value).toBe("Marketing site");
});

it("REQ-013.1: Archive project archives it, and is disabled while saving", async () => {
  let settle!: (result: ActionResult<null>) => void;
  const archiveProject = vi.fn(
    () =>
      new Promise<ActionResult<null>>((resolve) => {
        settle = resolve;
      }),
  );
  renderSettings({ archiveProject });

  fireEvent.click(screen.getByRole("button", { name: "Archive project" }));

  expect(archiveProject).toHaveBeenCalledWith({ key: "WEB", archived: true });
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Archive project" }) as HTMLButtonElement).disabled).toBe(
      true,
    ),
  );
  settle(done);
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Archive project" }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
});

it("REQ-013.3, REQ-013.7: an archived project shows the name read-only with no Save, and Unarchive project unarchives it", async () => {
  const { archiveProject } = renderSettings({ project: archivedWeb });

  expect(screen.getByText("Website", { selector: ".tl-fact__value" })).toBeTruthy();
  expect(screen.queryByLabelText("Name")).toBeNull();
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  expect(screen.getByText("Archived")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Unarchive project" }));

  await waitFor(() => expect(archiveProject).toHaveBeenCalledWith({ key: "WEB", archived: false }));
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Unarchive project" }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
});

it("STD-9: a refused archive toasts the server's message", async () => {
  renderSettings({ archiveProject: vi.fn(async () => refused("notFound", "Not found")) });

  fireEvent.click(screen.getByRole("button", { name: "Archive project" }));

  expect(await screen.findByText("Not found")).toBeTruthy();
});

it("REQ-014.1, REQ-014.2: Delete stays disabled until the key matches exactly, then deletes and loads My issues", async () => {
  const { deleteProject } = renderSettings();
  const dialog = openDelete();

  const confirm = within(dialog).getByRole("button", { name: "Delete project" }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.change(within(dialog).getByLabelText("Type WEB to confirm"), { target: { value: "WEBB" } });
  expect(confirm.disabled).toBe(true);
  fireEvent.change(within(dialog).getByLabelText("Type WEB to confirm"), { target: { value: "web" } });
  expect(confirm.disabled).toBe(true);

  fireEvent.change(within(dialog).getByLabelText("Type WEB to confirm"), { target: { value: "WEB" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete project" }));

  await waitFor(() => expect(loadPage).toHaveBeenCalledWith("/my-issues"));
  expect(deleteProject).toHaveBeenCalledWith({ key: "WEB" });
});

it("STD-9: a refused delete toasts the server's message, stays on the page and can be tried again", async () => {
  renderSettings({ deleteProject: vi.fn(async () => refused("notFound", "Not found")) });
  const dialog = openDelete();

  fireEvent.change(within(dialog).getByLabelText("Type WEB to confirm"), { target: { value: "WEB" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete project" }));

  expect(await screen.findByText("Not found")).toBeTruthy();
  expect(loadPage).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(
      (within(dialog).getByRole("button", { name: "Delete project" }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
});