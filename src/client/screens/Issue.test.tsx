import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  admin,
  alex,
  apiError,
  issue,
  memberOf,
  mockApi,
  never,
  noContent,
  project,
  renderAppAt,
  requestsTo,
  sam,
} from "../../test/client-app";
import type { Issue, IssueLabel, Label, Me, Project } from "../api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Answer = (body: unknown) => Response | Promise<Response>;

const web = project("WEB", "Website");
const jordan: Me = { ...alex, username: "jordan", fullName: "Jordan Diaz", initials: "JD" };
const priya: Me = { ...alex, username: "priya", fullName: "Priya Shah", initials: "PS", deactivated: true };
const team = [alex, jordan, priya, sam];

function label(name: string): Label {
  return { id: `l-${name.toLowerCase()}`, name, color: "gray", issueCount: 0 };
}

function onIssue({ id, name, color }: Label): IssueLabel {
  return { id, name, color };
}

const webLabels = ["backend", "bug", "Design", "docs", "frontend"].map(label);

function labelled(...names: string[]) {
  return names.map((name) => onIssue(webLabels.find((candidate) => candidate.name === name) as Label));
}

function mockIssue({
  me = sam,
  shown = issue(),
  inProject = web,
  patch,
  labels = () => webLabels,
}: {
  me?: Me;
  shown?: Issue;
  inProject?: Project;
  patch?: Answer;
  labels?: () => Label[];
} = {}) {
  let current: Issue | undefined = shown;
  const created: Label[] = [];
  const known = () => [...labels(), ...created];
  return mockApi({
    "GET /api/me": () => Response.json(me),
    "GET /api/members": () => Response.json(team),
    [`GET /api/projects/${inProject.key}`]: () => Response.json(inProject),
    [`GET /api/projects/${inProject.key}/labels`]: () => Response.json(known()),
    [`POST /api/projects/${inProject.key}/labels`]: (body) => {
      const made = { ...label((body as { name: string }).name), id: "l-new" };
      created.push(made);
      return Response.json(made, { status: 201 });
    },
    [`GET /api/issues/${shown.id}`]: () => (current ? Response.json(current) : apiError(404, "Not found")),
    [`PATCH /api/issues/${shown.id}`]:
      patch ??
      ((body) => {
        const change = body as Partial<Omit<Issue, "assignee">> & {
          assignee?: string | null;
          labelIds?: string[];
        };
        const { assignee, labelIds, ...rest } = change;
        const member = team.find((candidate) => candidate.username === assignee);
        current = {
          ...(current as Issue),
          ...rest,
          ...(assignee !== undefined && { assignee: member ? memberOf(member) : null }),
          ...(labelIds && {
            labels: labelIds.map((labelId) => onIssue(known().find(({ id }) => id === labelId) as Label)),
          }),
          ...(rest.description !== undefined && {
            descriptionVersion: (current as Issue).descriptionVersion + 1,
          }),
        };
        return Response.json(current);
      }),
    [`DELETE /api/issues/${shown.id}`]: () => {
      current = undefined;
      return noContent();
    },
  });
}

async function titleField() {
  return (await screen.findByRole("textbox", { name: "Title" })) as HTMLTextAreaElement;
}

async function pick(name: string) {
  return screen.findByRole("button", { name: new RegExp(`^${name}`) });
}

async function openPicker(name: string) {
  fireEvent.click(await pick(name));
  return screen.findByRole("listbox");
}

function keysOf(listbox: HTMLElement) {
  return within(listbox)
    .getAllByRole("option")
    .map((option) => option.getAttribute("data-key"));
}

it("REQ-016.5: a lower-case address opens the issue at its canonical address", async () => {
  mockIssue();
  renderAppAt("/issue/web-42");

  expect((await titleField()).value).toBe("Fix login button");
  expect(window.location.pathname).toBe("/issue/WEB-42");
  expect(screen.getByText("WEB-42")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Website · WEB" }).getAttribute("href")).toBe("/project/WEB");
});

it("REQ-016: pressing Enter in the title saves it", async () => {
  const fetchMock = mockIssue();
  renderAppAt("/issue/WEB-42");

  const title = await titleField();
  fireEvent.change(title, { target: { value: "Fix the login button" } });
  fireEvent.keyDown(title, { key: "Enter" });

  await waitFor(() =>
    expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([{ title: "Fix the login button" }]),
  );
  await waitFor(() => expect(title.value).toBe("Fix the login button"));
});

it("REQ-016: leaving the title saves it, and Escape restores the saved title without saving", async () => {
  const fetchMock = mockIssue();
  renderAppAt("/issue/WEB-42");

  const title = await titleField();
  fireEvent.change(title, { target: { value: "Something else" } });
  fireEvent.keyDown(title, { key: "Escape" });
  expect(title.value).toBe("Fix login button");
  fireEvent.blur(title);
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([]);

  fireEvent.change(title, { target: { value: "Fix the login button" } });
  fireEvent.blur(title);
  await waitFor(() =>
    expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([{ title: "Fix the login button" }]),
  );
});

it("REQ-016.3: a title of only spaces gets Title required and keeps what was typed", async () => {
  mockIssue({ patch: () => apiError(422, "Check the highlighted fields", { title: "Title required" }) });
  renderAppAt("/issue/WEB-42");

  const title = await titleField();
  fireEvent.change(title, { target: { value: "   " } });
  fireEvent.keyDown(title, { key: "Enter" });

  expect(await screen.findByText("Title required")).toBeTruthy();
  expect(title.value).toBe("   ");
  expect(title.getAttribute("aria-invalid")).toBe("true");
});

it("REQ-016: a title over 200 characters gets Too long (max 200)", async () => {
  mockIssue({ patch: () => apiError(422, "Check the highlighted fields", { title: "Too long (max 200)" }) });
  renderAppAt("/issue/WEB-42");

  const title = await titleField();
  fireEvent.change(title, { target: { value: "x".repeat(201) } });
  fireEvent.keyDown(title, { key: "Enter" });

  expect(await screen.findByText("Too long (max 200)")).toBeTruthy();
  expect(title.value).toBe("x".repeat(201));
});

it("REQ-017: the Status picker lists every status in order with the current one checked", async () => {
  mockIssue();
  renderAppAt("/issue/WEB-42");

  const listbox = await openPicker("Status");
  expect(keysOf(listbox)).toEqual(["backlog", "in_progress", "in_review", "done", "canceled"]);
  expect(within(listbox).getByRole("option", { name: "In Progress" }).getAttribute("aria-selected")).toBe(
    "true",
  );
});

it("REQ-017.1: moving an issue from Backlog straight to Done saves it", async () => {
  const fetchMock = mockIssue({ shown: issue({ status: "backlog" }) });
  renderAppAt("/issue/WEB-42");

  const listbox = await openPicker("Status");
  fireEvent.click(within(listbox).getByRole("option", { name: "Done" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /^Status/ }).textContent ?? "").toContain("Done"),
  );
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([{ status: "done" }]);
});

it("REQ-018.1: setting the priority to Urgent shows Urgent", async () => {
  const fetchMock = mockIssue();
  renderAppAt("/issue/WEB-42");

  const listbox = await openPicker("Priority");
  expect(keysOf(listbox)).toEqual(["none", "urgent", "high", "medium", "low"]);
  fireEvent.click(within(listbox).getByRole("option", { name: "Urgent" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /^Priority/ }).textContent).toContain("Urgent"),
  );
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([{ priority: "urgent" }]);
});

it("REQ-019.1: assigning Alex shows Alex, choosing from Unassigned and active members", async () => {
  const fetchMock = mockIssue({ shown: issue({ assignee: null }) });
  renderAppAt("/issue/WEB-42");

  const listbox = await openPicker("Assignee");
  expect(keysOf(listbox)).toEqual(["_unassigned", "alex", "jordan", "sam"]);
  fireEvent.click(within(listbox).getByRole("option", { name: "Alex Kim" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /^Assignee/ }).textContent).toContain("Alex Kim"),
  );
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([{ assignee: "alex" }]);
});

it("REQ-019.2: clearing the assignee shows Unassigned", async () => {
  const fetchMock = mockIssue();
  renderAppAt("/issue/WEB-42");

  const listbox = await openPicker("Assignee");
  fireEvent.click(within(listbox).getByRole("option", { name: "Unassigned" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /^Assignee/ }).textContent).toContain("Unassigned"),
  );
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([{ assignee: null }]);
});

it("REQ-019: assigning someone who isn't an active member shows Choose an active member", async () => {
  mockIssue({
    patch: () => apiError(422, "Check the highlighted fields", { assignee: "Choose an active member" }),
  });
  renderAppAt("/issue/WEB-42");

  const listbox = await openPicker("Assignee");
  fireEvent.click(within(listbox).getByRole("option", { name: "Jordan Diaz" }));

  expect(await screen.findByText("Choose an active member")).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Assignee/ }).textContent).toContain("Alex Kim");
});

it("REQ-019: typing in the assignee search filters members by name or username, keeping Unassigned", async () => {
  mockIssue();
  renderAppAt("/issue/WEB-42");

  await openPicker("Assignee");
  const search = screen.getByRole("searchbox", { name: "Filter members" });
  fireEvent.change(search, { target: { value: "jor" } });
  expect(keysOf(screen.getByRole("listbox"))).toEqual(["_unassigned", "jordan"]);

  fireEvent.change(search, { target: { value: "Sam L" } });
  expect(keysOf(screen.getByRole("listbox"))).toEqual(["_unassigned", "sam"]);
});

it("STD-9: a failed picker save shows the toast and keeps the old value", async () => {
  mockIssue({ patch: () => apiError(500, "Internal error") });
  renderAppAt("/issue/WEB-42");

  const listbox = await openPicker("Priority");
  fireEvent.click(within(listbox).getByRole("option", { name: "Urgent" }));

  expect(await screen.findByText("Couldn't save. Try again.")).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Priority/ }).textContent).toContain("High");
});

it("REQ-023.1: the creator deletes the issue after confirming and lands on the project board", async () => {
  const fetchMock = mockIssue();
  renderAppAt("/issue/WEB-42");

  fireEvent.click(await screen.findByRole("button", { name: "Delete issue" }));
  const dialog = screen.getByRole("alertdialog", { name: "Delete WEB-42?" });
  expect(
    within(dialog).getByText(
      "“Fix login button” and its comments will be deleted permanently. You can’t undo this.",
    ),
  ).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete issue" }));

  await waitFor(() => expect(window.location.pathname).toBe("/project/WEB"));
  expect(requestsTo(fetchMock, "DELETE /api/issues/WEB-42")).toHaveLength(1);
});

it("REQ-023: the delete confirmation focuses Cancel, which closes it without deleting", async () => {
  const fetchMock = mockIssue();
  renderAppAt("/issue/WEB-42");

  fireEvent.click(await screen.findByRole("button", { name: "Delete issue" }));
  const dialog = screen.getByRole("alertdialog", { name: "Delete WEB-42?" });
  const cancel = within(dialog).getByRole("button", { name: "Cancel" });
  await waitFor(() => expect(document.activeElement).toBe(cancel));
  fireEvent.click(cancel);

  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(requestsTo(fetchMock, "DELETE /api/issues/WEB-42")).toEqual([]);
});

it("REQ-023.2: a member who didn't create the issue sees no Delete option, while an admin does", async () => {
  mockIssue({ me: alex });
  renderAppAt("/issue/WEB-42");
  await titleField();
  expect(screen.queryByRole("button", { name: "Delete issue" })).toBeNull();
  cleanup();

  mockIssue({ me: { ...admin, username: "jordan", fullName: "Jordan Diaz", initials: "JD" } });
  renderAppAt("/issue/WEB-42");
  expect(await screen.findByRole("button", { name: "Delete issue" })).toBeTruthy();
});

it("STD-4: an unknown issue ID shows Not found", async () => {
  mockApi({
    "GET /api/me": () => Response.json(sam),
    "GET /api/members": () => Response.json(team),
    "GET /api/projects/WEB": () => Response.json(web),
    "GET /api/issues/WEB-40": () => apiError(404, "Not found"),
  });
  renderAppAt("/issue/WEB-40");

  expect(await screen.findByRole("heading", { name: "Not found" })).toBeTruthy();
});

it("REQ-013: an issue in an archived project is read-only", async () => {
  mockIssue({
    shown: issue({ archived: true }),
    inProject: project("WEB", "Website", "2026-10-01T10:00:00.000Z"),
  });
  renderAppAt("/issue/WEB-42");

  expect(await screen.findByRole("heading", { name: "Fix login button" })).toBeTruthy();
  expect(screen.getByText("Archived")).toBeTruthy();
  expect(screen.getByText("In Progress")).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^(Status|Priority|Assignee)/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete issue" })).toBeNull();
});

function labelsPick() {
  return screen.findByRole("button", { name: /^Labels/, hidden: true });
}

function labelOption(name: string) {
  return within(screen.getByRole("listbox")).getByRole("option", { name: new RegExp(`^${name}`) });
}

it("REQ-020.1: adding bug and frontend saves each and shows both", async () => {
  const fetchMock = mockIssue();
  renderAppAt("/issue/WEB-42");

  await openPicker("Labels");
  fireEvent.click(labelOption("bug"));
  await waitFor(async () => expect((await labelsPick()).textContent).toContain("bug"));
  fireEvent.click(labelOption("frontend"));

  await waitFor(async () => expect((await labelsPick()).textContent).toContain("frontend"));
  expect((await labelsPick()).textContent).toContain("bug");
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([
    { labelIds: ["l-bug"] },
    { labelIds: ["l-bug", "l-frontend"] },
  ]);
});

it("REQ-020: unchecking a label in the picker removes it", async () => {
  const fetchMock = mockIssue({ shown: issue({ labels: labelled("bug", "frontend") }) });
  renderAppAt("/issue/WEB-42");

  const listbox = await openPicker("Labels");
  expect(
    within(listbox)
      .getByRole("option", { name: /^frontend/ })
      .getAttribute("aria-selected"),
  ).toBe("true");
  fireEvent.click(labelOption("frontend"));

  await waitFor(async () => expect((await labelsPick()).textContent).not.toContain("frontend"));
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([{ labelIds: ["l-bug"] }]);
});

it("REQ-020.2: typing a name that doesn't exist creates it as Gray and adds it", async () => {
  const fetchMock = mockIssue({ labels: () => webLabels.filter(({ name }) => name !== "Design") });
  renderAppAt("/issue/WEB-42");

  await openPicker("Labels");
  fireEvent.change(screen.getByRole("searchbox", { name: "Filter or create labels" }), {
    target: { value: "Design" },
  });
  fireEvent.click(labelOption("Create label “Design”"));

  await waitFor(async () => expect((await labelsPick()).textContent).toContain("Design"));
  expect(requestsTo(fetchMock, "POST /api/projects/WEB/labels")).toEqual([{ name: "Design", color: "gray" }]);
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([{ labelIds: ["l-new"] }]);
});

it("REQ-020.5: typing a name that differs only in capitals adds the existing label", async () => {
  const fetchMock = mockIssue();
  renderAppAt("/issue/WEB-42");

  await openPicker("Labels");
  fireEvent.change(screen.getByRole("searchbox", { name: "Filter or create labels" }), {
    target: { value: "design" },
  });
  expect(keysOf(screen.getByRole("listbox"))).toEqual(["l-design"]);
  fireEvent.click(labelOption("Design"));

  await waitFor(async () => expect((await labelsPick()).textContent).toContain("Design"));
  expect(requestsTo(fetchMock, "POST /api/projects/WEB/labels")).toEqual([]);
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([{ labelIds: ["l-design"] }]);
});

it("REQ-020.3: adding an 11th label shows Maximum 10 labels and keeps the labels", async () => {
  mockIssue({
    shown: issue({ labels: labelled("bug") }),
    patch: () => apiError(422, "Check the highlighted fields", { labelIds: "Maximum 10 labels" }),
  });
  renderAppAt("/issue/WEB-42");

  await openPicker("Labels");
  fireEvent.click(labelOption("docs"));

  const error = await screen.findByText("Maximum 10 labels");
  const labels = await labelsPick();
  expect(labels.textContent).not.toContain("docs");
  expect(labels.getAttribute("aria-describedby")).toContain(error.closest("[id]")?.id);
});

it("REQ-020.4: a label deleted meanwhile shows the toast and keeps the other labels", async () => {
  let deleted = false;
  const fetchMock = mockIssue({
    shown: issue({ labels: labelled("bug", "docs") }),
    labels: () => webLabels.filter(({ name }) => !(deleted && name === "frontend")),
    patch: () => {
      deleted = true;
      return apiError(404, "That label no longer exists");
    },
  });
  renderAppAt("/issue/WEB-42");

  await openPicker("Labels");
  fireEvent.click(labelOption("frontend"));

  expect(await screen.findByText("That label no longer exists")).toBeTruthy();
  const labels = await labelsPick();
  expect(labels.textContent).toContain("bug");
  expect(labels.textContent).toContain("docs");
  await waitFor(() => expect(screen.queryByRole("option", { name: /^frontend/ })).toBeNull());
  expect(requestsTo(fetchMock, "GET /api/projects/WEB/labels").length).toBeGreaterThan(1);
});

it("STD-9: a failed label save shows the toast and keeps the old labels", async () => {
  mockIssue({ shown: issue({ labels: labelled("bug") }), patch: () => apiError(500, "Internal error") });
  renderAppAt("/issue/WEB-42");

  await openPicker("Labels");
  fireEvent.click(labelOption("backend"));

  expect(await screen.findByText("Couldn't save. Try again.")).toBeTruthy();
  expect((await labelsPick()).textContent).not.toContain("backend");
});

it("REQ-013: an archived issue shows its labels read-only", async () => {
  mockIssue({
    shown: issue({ archived: true, labels: labelled("bug") }),
    inProject: project("WEB", "Website", "2026-10-01T10:00:00.000Z"),
  });
  renderAppAt("/issue/WEB-42");

  expect(await screen.findByText("bug")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Labels/ })).toBeNull();
});

async function editDescription() {
  fireEvent.click(await screen.findByRole("button", { name: "Edit description" }));
  return (await screen.findByRole("textbox", { name: "Description (Markdown)" })) as HTMLTextAreaElement;
}

it("REQ-022.1: saving a description with a checklist and a code block shows it formatted", async () => {
  const fetchMock = mockIssue();
  renderAppAt("/issue/WEB-42");

  const editor = await editDescription();
  const text = "- [x] Reproduce in Safari\n\n```js\nsignIn();\n```";
  fireEvent.change(editor, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("checkbox")).toBeTruthy();
  expect(document.querySelector("pre")?.textContent).toContain("signIn();");
  expect(screen.queryByRole("textbox", { name: "Description (Markdown)" })).toBeNull();
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([
    { description: text, descriptionVersion: 0 },
  ]);
});

it("REQ-022.2: a description of 20,001 characters shows Too long (max 20,000) and keeps the text", async () => {
  mockIssue({
    patch: () => apiError(422, "Check the highlighted fields", { description: "Too long (max 20,000)" }),
  });
  renderAppAt("/issue/WEB-42");

  const editor = await editDescription();
  fireEvent.change(editor, { target: { value: "x".repeat(20001) } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Too long (max 20,000)")).toBeTruthy();
  expect(editor.value).toBe("x".repeat(20001));
  expect(editor.getAttribute("aria-invalid")).toBe("true");
});

it("STD-8: a stale description save shows the conflict message in the editor and keeps the text", async () => {
  mockIssue({ patch: () => apiError(409, "This was changed by Alex Kim. Copy your text and reload.") });
  renderAppAt("/issue/WEB-42");

  const editor = await editDescription();
  fireEvent.change(editor, { target: { value: "My version" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect((await screen.findByRole("alert")).textContent).toContain(
    "This was changed by Alex Kim. Copy your text and reload.",
  );
  expect(editor.value).toBe("My version");
  expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
});

it("STD-5: Save is disabled while the description saves", async () => {
  mockIssue({ patch: never });
  renderAppAt("/issue/WEB-42");

  const editor = await editDescription();
  fireEvent.change(editor, { target: { value: "Saving this" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  const saving = (await screen.findByRole("button", { name: "Saving…" })) as HTMLButtonElement;
  expect(saving.disabled).toBe(true);
});

it("REQ-022: Cancel or Escape discards the description draft", async () => {
  const fetchMock = mockIssue({ shown: issue({ description: "Old text" }) });
  renderAppAt("/issue/WEB-42");

  let editor = await editDescription();
  fireEvent.change(editor, { target: { value: "New text" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("textbox", { name: "Description (Markdown)" })).toBeNull();
  expect(screen.getByText("Old text")).toBeTruthy();

  editor = await editDescription();
  fireEvent.change(editor, { target: { value: "New text" } });
  fireEvent.keyDown(editor, { key: "Escape" });
  expect(screen.queryByRole("textbox", { name: "Description (Markdown)" })).toBeNull();
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([]);
});

it("REQ-013: an archived issue's description has no Edit button", async () => {
  mockIssue({
    shown: issue({ archived: true, description: "Old text" }),
    inProject: project("WEB", "Website", "2026-10-01T10:00:00.000Z"),
  });
  renderAppAt("/issue/WEB-42");

  expect(await screen.findByText("Old text")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Edit description" })).toBeNull();
});