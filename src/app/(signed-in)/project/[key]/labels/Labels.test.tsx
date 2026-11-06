import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../../../components/toast";
import type { ActionResult, Label, ProjectSummary } from "../../../../../contract";
import { done, pendingAction, refused, renderForm, sentFields } from "../../../../../test/forms";
import { Labels, type LabelsActions } from "./Labels";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  router.refresh.mockClear();
});

const web: ProjectSummary = { key: "WEB", name: "Website", archivedAt: null };
const archivedWeb: ProjectSummary = { ...web, archivedAt: "2026-10-01T10:00:00.000Z" };

const typical: Label[] = [
  { id: "id-backend", name: "backend", color: "blue", issueCount: 7 },
  { id: "id-bug", name: "bug", color: "red", issueCount: 9 },
  { id: "id-docs", name: "docs", color: "gray", issueCount: 0 },
  { id: "id-frontend", name: "frontend", color: "green", issueCount: 12 },
  { id: "id-safari", name: "Safari", color: "orange", issueCount: 1 },
];

type Stubs = { [Name in keyof LabelsActions]: ReturnType<typeof vi.fn<LabelsActions[Name]>> };

function renderLabels({
  project = web,
  labels = typical,
  ...overrides
}: Partial<LabelsActions> & { project?: ProjectSummary; labels?: Label[] } = {}) {
  const actions = {
    createLabel: vi.fn(async () => done),
    updateLabel: vi.fn(async () => done),
    deleteLabel: vi.fn(async () => done),
    ...overrides,
  } as Stubs;
  const view = renderForm(
    <Labels
      project={project}
      labels={labels}
      {...actions}
    />,
  );
  const show = (shown: Label[]) =>
    view.rerender(
      <ToastProvider>
        <Labels
          project={project}
          labels={shown}
          {...actions}
        />
      </ToastProvider>,
    );
  return { ...actions, view, show };
}

function labelList() {
  return screen.getByRole("list", { name: "Labels" });
}

function row(name: string) {
  const found = within(labelList())
    .getAllByRole("listitem")
    .find((item) => within(item).queryByText(name, { selector: ".tl-pill" }));
  if (!found) throw new Error(`No row for ${name}`);
  return found;
}

function openCreate() {
  fireEvent.click(screen.getByRole("button", { name: "New label" }));
  return screen.getByRole("form", { name: "New label" });
}

async function openActions(name: string) {
  fireEvent.click(screen.getByRole("button", { name: `Actions for ${name}` }));
  return screen.findByRole("menu");
}

async function chooseAction(name: string, action: string) {
  fireEvent.click(within(await openActions(name)).getByRole("menuitem", { name: action }));
}

async function openRename(name: string) {
  await chooseAction(name, "Rename");
  return screen.findByRole("form", { name: `Rename ${name}` });
}

async function openColors(name: string) {
  const changeColor = within(await openActions(name)).getByRole("menuitem", { name: "Change color…" });
  changeColor.focus();
  fireEvent.keyDown(changeColor, { key: "ArrowRight" });
  return (await screen.findAllByRole("menu"))[1];
}

function renamed(name: string) {
  return typical.map((label) => (label.id === "id-bug" ? { ...label, name } : label));
}

it("REQ-021: lists each label with its colour name and issue count", () => {
  renderLabels();

  const names = within(labelList())
    .getAllByRole("listitem")
    .map((item) => item.querySelector(".tl-pill")?.textContent);
  expect(names).toEqual(["backend", "bug", "docs", "frontend", "Safari"]);
  expect(row("backend").textContent).toContain("Blue");
  expect(row("backend").textContent).toContain("7 issues");
  expect(row("Safari").textContent).toContain("1 issue");
  expect(row("Safari").textContent).not.toContain("1 issues");
});

it("STD-7: an empty project names the next action, and Create one. opens the new label form", () => {
  renderLabels({ labels: [] });

  expect(screen.getByText("No labels yet.")).toBeTruthy();
  expect(screen.queryByRole("list", { name: "Labels" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Create one." }));

  expect(screen.getByRole("form", { name: "New label" })).toBeTruthy();
});

it("REQ-021, STD-5: creating a label is disabled while saving, then sends its project, name and colour and closes the form", async () => {
  const save = pendingAction();
  renderLabels({ createLabel: save.act });
  const form = openCreate();

  const name = within(form).getByLabelText("Name");
  await waitFor(() => expect(document.activeElement).toBe(name));
  fireEvent.change(name, { target: { value: "performance" } });
  fireEvent.click(within(form).getByRole("button", { name: "Color: Gray" }));
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitemradio", { name: /Blue/ }));
  fireEvent.click(within(form).getByRole("button", { name: "Create label" }));

  const saving = (await within(form).findByRole("button", { name: "Creating…" })) as HTMLButtonElement;
  expect(saving.disabled).toBe(true);
  expect(sentFields(save.act)).toEqual({ key: "WEB", name: "performance", color: "blue" });

  save.settle(done);

  await waitFor(() => expect(screen.queryByRole("form", { name: "New label" })).toBeNull());
});

it("REQ-021, REQ-021.2: create field errors show under Name and Color and keep what was typed", async () => {
  renderLabels({
    createLabel: vi.fn(async () =>
      refused("invalid", "Check the highlighted fields", {
        name: "Label already exists",
        color: "Choose a color",
      }),
    ),
  });
  const form = openCreate();

  fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "BUG" } });
  fireEvent.click(within(form).getByRole("button", { name: "Create label" }));

  expect(await within(form).findByText("Label already exists")).toBeTruthy();
  const name = within(form).getByLabelText("Name") as HTMLInputElement;
  expect(name.value).toBe("BUG");
  expect(name.getAttribute("aria-invalid")).toBe("true");

  const error = within(form).getByText("Choose a color");
  const color = within(form).getByRole("button", { name: "Color: Gray" });
  expect(color.getAttribute("aria-describedby")).toBe(error.closest("[id]")?.id);
});

it("REQ-021.1: renaming bug to defect is read-only while saving, then sends the label and its new name and closes", async () => {
  const save = pendingAction();
  renderLabels({ updateLabel: save.act as LabelsActions["updateLabel"] });
  const form = await openRename("bug");

  const name = within(form).getByLabelText("Name") as HTMLInputElement;
  expect(name.value).toBe("bug");
  fireEvent.change(name, { target: { value: "defect" } });
  fireEvent.click(within(form).getByRole("button", { name: "Save" }));

  await waitFor(() => expect(name.readOnly).toBe(true));
  expect((within(form).getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  expect(sentFields(save.act)).toEqual({ id: "id-bug", name: "defect" });

  save.settle(done);

  await waitFor(() => expect(screen.queryByRole("form", { name: "Rename bug" })).toBeNull());
});

it("STD-3: a rename field error shows beside the name and keeps what was typed", async () => {
  renderLabels({
    updateLabel: vi.fn(async () =>
      refused("invalid", "Check the highlighted fields", { name: "Name required" }),
    ),
  });
  const form = await openRename("bug");

  fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "  " } });
  fireEvent.click(within(form).getByRole("button", { name: "Save" }));

  expect(await within(form).findByText("Name required")).toBeTruthy();
  expect((within(form).getByLabelText("Name") as HTMLInputElement).value).toBe("  ");
});

it("REQ-021: recolouring marks the current colour and saves the chosen one", async () => {
  const { updateLabel } = renderLabels();

  const colors = await openColors("frontend");
  expect(within(colors).getByRole("menuitem", { name: /Green/ }).textContent).toContain("✓");
  expect(within(colors).getByRole("menuitem", { name: /Blue/ }).textContent).not.toContain("✓");
  fireEvent.click(within(colors).getByRole("menuitem", { name: /Blue/ }));

  await waitFor(() => expect(updateLabel).toHaveBeenCalledWith({ id: "id-frontend", color: "blue" }));
});

it("REQ-021.5: deleting asks with the issue count; cancelling keeps the label, confirming shows Deleting… then deletes it", async () => {
  let settle!: (result: ActionResult<null>) => void;
  const deleteLabel = vi.fn(
    () =>
      new Promise<ActionResult<null>>((resolve) => {
        settle = resolve;
      }),
  );
  renderLabels({ deleteLabel });

  await chooseAction("frontend", "Delete…");
  const cancelled = screen.getByRole("dialog", { name: "Delete frontend?" });
  expect(cancelled.textContent).toContain("It will be removed from 12 issues.");
  fireEvent.click(within(cancelled).getByRole("button", { name: "Cancel" }));

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(deleteLabel).not.toHaveBeenCalled();

  await chooseAction("frontend", "Delete…");
  const dialog = screen.getByRole("dialog", { name: "Delete frontend?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

  const deleting = (await within(dialog).findByRole("button", { name: "Deleting…" })) as HTMLButtonElement;
  expect(deleting.disabled).toBe(true);
  expect(deleteLabel).toHaveBeenCalledWith({ id: "id-frontend" });
  settle(done);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("REQ-013.5: an archived project lists labels with no edit controls", () => {
  renderLabels({ project: archivedWeb });

  expect(row("bug")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "New label" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Actions for / })).toBeNull();
});

it("REQ-013.6, STD-9: a refused rename toasts the server's message and keeps the typed name; a label gone meanwhile also refreshes the page", async () => {
  const refusals = [
    refused("forbidden", "This project is archived"),
    refused("notFound", "That label no longer exists"),
  ];
  renderLabels({ updateLabel: vi.fn(async () => refusals.shift() ?? done) });
  const form = await openRename("bug");

  fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "defect" } });
  fireEvent.click(within(form).getByRole("button", { name: "Save" }));

  expect(await screen.findByText("This project is archived")).toBeTruthy();
  expect((within(form).getByLabelText("Name") as HTMLInputElement).value).toBe("defect");
  expect(router.refresh).not.toHaveBeenCalled();

  fireEvent.click(within(form).getByRole("button", { name: "Save" }));

  expect(await screen.findByText("That label no longer exists")).toBeTruthy();
  expect(router.refresh).toHaveBeenCalledOnce();
});

it("NFR-007: New label moves focus into the form; Escape and Create label return it to New label", async () => {
  renderLabels();

  const escaping = openCreate();
  await waitFor(() => expect(document.activeElement).toBe(within(escaping).getByLabelText("Name")));
  fireEvent.keyDown(within(escaping).getByLabelText("Name"), { key: "Escape" });
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "New label" })));

  const saving = openCreate();
  fireEvent.change(within(saving).getByLabelText("Name"), { target: { value: "performance" } });
  fireEvent.click(within(saving).getByRole("button", { name: "Create label" }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "New label" })));
});

it("NFR-007: Rename moves focus into the form; Escape and Save return it to the label's actions", async () => {
  const { show } = renderLabels();

  const escaping = await openRename("bug");
  await waitFor(() => expect(document.activeElement).toBe(within(escaping).getByLabelText("Name")));
  fireEvent.keyDown(within(escaping).getByLabelText("Name"), { key: "Escape" });
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Actions for bug" })),
  );

  const saving = await openRename("bug");
  fireEvent.change(within(saving).getByLabelText("Name"), { target: { value: "defect" } });
  fireEvent.click(within(saving).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("form", { name: "Rename bug" })).toBeNull());
  show(renamed("defect"));

  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Actions for defect" })),
  );
});