import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  admin,
  apiError,
  mockApi,
  never,
  noContent,
  project,
  renderAppAt,
  requestsTo,
  summary,
} from "../../test/client-app";
import type { Label, Project } from "../api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Answer = (body: unknown) => Response | Promise<Response>;

const web = project("WEB", "Website");
const archivedWeb = project("WEB", "Website", "2026-10-01T10:00:00.000Z");

const typical: Label[] = [
  { id: "id-backend", name: "backend", color: "blue", issueCount: 7 },
  { id: "id-bug", name: "bug", color: "red", issueCount: 9 },
  { id: "id-docs", name: "docs", color: "gray", issueCount: 0 },
  { id: "id-frontend", name: "frontend", color: "green", issueCount: 12 },
  { id: "id-safari", name: "Safari", color: "orange", issueCount: 1 },
];

function mockLabels({
  shown = web,
  labels = typical,
  list,
  post,
  patch,
}: {
  shown?: Project;
  labels?: Label[];
  list?: Answer;
  post?: Answer;
  patch?: Answer;
} = {}) {
  let current = labels;
  const byName = (a: Label, b: Label) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  const routes: Record<string, Answer> = {
    "GET /api/me": () => Response.json(admin),
    "GET /api/projects?archived=false": () => Response.json(shown.archivedAt ? [] : [summary(shown)]),
    "GET /api/projects/WEB": () => Response.json(shown),
    "GET /api/projects/WEB/labels": list ?? (() => Response.json(current)),
    "POST /api/projects/WEB/labels":
      post ??
      ((body) => {
        const created = { id: "id-new", ...(body as Pick<Label, "name" | "color">), issueCount: 0 };
        current = [...current, created].sort(byName);
        return Response.json(created, { status: 201 });
      }),
  };
  for (const label of labels) {
    routes[`PATCH /api/labels/${label.id}`] =
      patch ??
      ((body) => {
        const changed = { ...label, ...(body as Partial<Label>) };
        current = current.map((each) => (each.id === label.id ? changed : each)).sort(byName);
        return Response.json(changed);
      });
    routes[`DELETE /api/labels/${label.id}`] = () => {
      current = current.filter((each) => each.id !== label.id);
      return noContent();
    };
  }
  return mockApi(routes);
}

async function labelList() {
  return screen.findByRole("list", { name: "Labels" });
}

async function row(name: string) {
  const list = await labelList();
  return waitFor(() => {
    const items = within(list).getAllByRole("listitem");
    const found = items.find((item) => within(item).queryByText(name, { selector: ".tl-pill" }));
    if (!found) throw new Error(`No row for ${name}`);
    return found;
  });
}

async function openCreate() {
  fireEvent.click(await screen.findByRole("button", { name: "New label" }));
  return screen.getByRole("form", { name: "New label" });
}

async function openRename(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: `Rename ${name}` }));
  return screen.getByRole("form", { name: `Rename ${name}` });
}

it("REQ-021: lists each label with its colour name and issue count", async () => {
  mockLabels();
  renderAppAt("/project/WEB/labels");

  const names = within(await labelList())
    .getAllByRole("listitem")
    .map((item) => item.querySelector(".tl-pill")?.textContent);
  expect(names).toEqual(["backend", "bug", "docs", "frontend", "Safari"]);
  expect((await row("backend")).textContent).toContain("Blue");
  expect((await row("backend")).textContent).toContain("7 issues");
  expect((await row("Safari")).textContent).toContain("1 issue");
  expect((await row("Safari")).textContent).not.toContain("1 issues");
});

it("STD-7: an empty project names the next action", async () => {
  mockLabels({ labels: [] });
  renderAppAt("/project/WEB/labels");

  expect(await screen.findByText("No labels yet. Create one.")).toBeTruthy();
  expect(screen.queryByRole("list", { name: "Labels" })).toBeNull();
});

it("STD-7: a load failure offers Retry", async () => {
  let calls = 0;
  const fetchMock = mockLabels({
    list: () => (++calls === 1 ? apiError(500, "Internal error") : Response.json(typical)),
  });
  renderAppAt("/project/WEB/labels");

  expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));

  expect(await labelList()).toBeTruthy();
  expect(requestsTo(fetchMock, "GET /api/projects/WEB/labels")).toHaveLength(2);
});

it("REQ-021: creating a label sends its name and colour and lists it", async () => {
  const fetchMock = mockLabels();
  renderAppAt("/project/WEB/labels");
  const form = await openCreate();

  const name = within(form).getByLabelText("Name");
  await waitFor(() => expect(document.activeElement).toBe(name));
  fireEvent.change(name, { target: { value: "performance" } });
  fireEvent.click(within(form).getByRole("button", { name: "Color: Gray" }));
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitemradio", { name: /Blue/ }));
  fireEvent.click(within(form).getByRole("button", { name: "Create label" }));

  expect(await row("performance")).toBeTruthy();
  expect(requestsTo(fetchMock, "POST /api/projects/WEB/labels")).toEqual([
    { name: "performance", color: "blue" },
  ]);
  expect(screen.queryByRole("form", { name: "New label" })).toBeNull();
  expect((await row("performance")).textContent).toContain("Blue");
});

it("STD-5: Create label is disabled while saving", async () => {
  mockLabels({ post: never });
  renderAppAt("/project/WEB/labels");
  const form = await openCreate();

  fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "performance" } });
  fireEvent.click(within(form).getByRole("button", { name: "Create label" }));

  const saving = (await within(form).findByRole("button", { name: "Creating…" })) as HTMLButtonElement;
  expect(saving.disabled).toBe(true);
});

it("REQ-021.2: a duplicate name shows the field error and keeps what was typed", async () => {
  mockLabels({ post: () => apiError(422, "Check the highlighted fields", { name: "Label already exists" }) });
  renderAppAt("/project/WEB/labels");
  const form = await openCreate();

  fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "BUG" } });
  fireEvent.click(within(form).getByRole("button", { name: "Create label" }));

  expect(await within(form).findByText("Label already exists")).toBeTruthy();
  const name = within(form).getByLabelText("Name") as HTMLInputElement;
  expect(name.value).toBe("BUG");
  expect(name.getAttribute("aria-invalid")).toBe("true");
});

it('REQ-021: an unknown colour shows "Choose a color" under Color', async () => {
  mockLabels({ post: () => apiError(422, "Check the highlighted fields", { color: "Choose a color" }) });
  renderAppAt("/project/WEB/labels");
  const form = await openCreate();

  fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "performance" } });
  fireEvent.click(within(form).getByRole("button", { name: "Create label" }));

  const error = await within(form).findByText("Choose a color");
  const color = within(form).getByRole("button", { name: "Color: Gray" });
  expect(color.getAttribute("aria-describedby")).toBe(error.closest("[id]")?.id);
});

it("REQ-021.1: renaming bug to defect saves and shows the new name", async () => {
  const fetchMock = mockLabels();
  renderAppAt("/project/WEB/labels");
  const form = await openRename("bug");

  const name = within(form).getByLabelText("Name") as HTMLInputElement;
  expect(name.value).toBe("bug");
  fireEvent.change(name, { target: { value: "defect" } });
  fireEvent.click(within(form).getByRole("button", { name: "Save" }));

  expect(await row("defect")).toBeTruthy();
  expect(requestsTo(fetchMock, "PATCH /api/labels/id-bug")).toEqual([{ name: "defect" }]);
  expect(screen.queryByRole("form", { name: "Rename bug" })).toBeNull();
});

it("STD-3: a rename field error shows beside the name and keeps what was typed", async () => {
  mockLabels({ patch: () => apiError(422, "Check the highlighted fields", { name: "Name required" }) });
  renderAppAt("/project/WEB/labels");
  const form = await openRename("bug");

  fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "  " } });
  fireEvent.click(within(form).getByRole("button", { name: "Save" }));

  expect(await within(form).findByText("Name required")).toBeTruthy();
  expect((within(form).getByLabelText("Name") as HTMLInputElement).value).toBe("  ");
});

it("REQ-021: recolouring saves the chosen colour", async () => {
  const fetchMock = mockLabels();
  renderAppAt("/project/WEB/labels");

  fireEvent.click(await screen.findByRole("button", { name: "Change color of frontend" }));
  const menu = await screen.findByRole("menu");
  expect(within(menu).getByRole("menuitemradio", { name: /Green/ }).getAttribute("aria-checked")).toBe(
    "true",
  );
  fireEvent.click(within(menu).getByRole("menuitemradio", { name: /Blue/ }));

  await waitFor(async () => expect((await row("frontend")).textContent).toContain("Blue"));
  expect(requestsTo(fetchMock, "PATCH /api/labels/id-frontend")).toEqual([{ color: "blue" }]);
});

it("REQ-021.5: deleting asks with the issue count, then deletes", async () => {
  const fetchMock = mockLabels();
  renderAppAt("/project/WEB/labels");

  fireEvent.click(await screen.findByRole("button", { name: "Delete frontend" }));
  const dialog = screen.getByRole("dialog", { name: "Delete frontend?" });
  expect(dialog.textContent).toContain("It will be removed from 12 issues.");
  await waitFor(() =>
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" })),
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(requestsTo(fetchMock, "DELETE /api/labels/id-frontend")).toHaveLength(1);
  await waitFor(async () =>
    expect(within(await labelList()).queryByText("frontend", { selector: ".tl-pill" })).toBeNull(),
  );
});

it("REQ-021.5: cancelling the confirmation keeps the label", async () => {
  const fetchMock = mockLabels();
  renderAppAt("/project/WEB/labels");

  fireEvent.click(await screen.findByRole("button", { name: "Delete frontend" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(requestsTo(fetchMock, "DELETE /api/labels/id-frontend")).toHaveLength(0);
  expect(await row("frontend")).toBeTruthy();
});

it("REQ-013.5: an archived project lists labels with no edit controls", async () => {
  mockLabels({ shown: archivedWeb });
  renderAppAt("/project/WEB/labels");

  expect(await row("bug")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "New label" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Rename / })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Change color of / })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Delete / })).toBeNull();
});

it("REQ-013.6: a rename refused because the project was archived shows the toast and keeps the label", async () => {
  mockLabels({ patch: () => apiError(403, "This project is archived") });
  renderAppAt("/project/WEB/labels");
  const form = await openRename("bug");

  fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "defect" } });
  fireEvent.click(within(form).getByRole("button", { name: "Save" }));

  expect(await screen.findByText("This project is archived")).toBeTruthy();
  expect((within(form).getByLabelText("Name") as HTMLInputElement).value).toBe("defect");
  expect(within(await labelList()).queryByText("defect", { selector: ".tl-pill" })).toBeNull();
});

it('STD-9: a label deleted meanwhile shows "That label no longer exists" and reloads the list', async () => {
  const fetchMock = mockLabels({ patch: () => apiError(404, "That label no longer exists") });
  renderAppAt("/project/WEB/labels");
  const form = await openRename("docs");

  fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "documentation" } });
  fireEvent.click(within(form).getByRole("button", { name: "Save" }));

  expect(await screen.findByText("That label no longer exists")).toBeTruthy();
  await waitFor(() => expect(requestsTo(fetchMock, "GET /api/projects/WEB/labels")).toHaveLength(2));
});