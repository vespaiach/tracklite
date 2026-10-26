import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  admin,
  alex,
  apiError,
  deferred,
  issue,
  memberOf,
  mockApi,
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
  get,
  patch,
  remove,
  labels = () => webLabels,
}: {
  me?: Me;
  shown?: Issue;
  inProject?: Project;
  get?: Answer;
  patch?: Answer;
  remove?: Answer;
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
    [`GET /api/issues/${shown.id}`]:
      get ?? (() => (current ? Response.json(current) : apiError(404, "Not found"))),
    [`PATCH /api/issues/${shown.id}`]:
      patch ??
      ((body) => {
        const change = body as Partial<Omit<Issue, "assignees">> & {
          assignees?: string[];
          labelIds?: string[];
        };
        const { assignees, labelIds, ...rest } = change;
        current = {
          ...(current as Issue),
          ...rest,
          ...(assignees && {
            assignees: team.filter(({ username }) => assignees.includes(username)).map(memberOf),
          }),
          ...(labelIds && {
            labels: labelIds.map((labelId) => onIssue(known().find(({ id }) => id === labelId) as Label)),
          }),
          ...(rest.description !== undefined && {
            descriptionVersion: (current as Issue).descriptionVersion + 1,
          }),
        };
        return Response.json(current);
      }),
    [`DELETE /api/issues/${shown.id}`]: async (body) => {
      const answer = await (remove ?? noContent)(body);
      if (answer.ok) current = undefined;
      return answer;
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

it("REQ-046: the issue page header shows the breadcrumb to the project and no view selected", async () => {
  mockIssue();
  renderAppAt("/issue/WEB-42");

  await titleField();
  const crumbs = within(screen.getByRole("banner")).getByRole("navigation", { name: "Breadcrumb" });
  expect(within(crumbs).getByRole("link", { name: "Project details" }).getAttribute("href")).toBe(
    "/project/WEB/detail",
  );
  expect(within(crumbs).getByRole("link", { name: "Website · WEB" }).getAttribute("href")).toBe(
    "/project/WEB",
  );
  const current = within(crumbs).getByText("WEB-42");
  expect(current.getAttribute("aria-current")).toBe("page");
  expect(current.getAttribute("title")).toBe("Fix login button");
  const views = screen.getByRole("navigation", { name: "Project views" });
  expect(within(views).queryAllByRole("link", { current: "page" })).toEqual([]);
});

it("REQ-046, STD-7: the project header stays while the issue loads and when it fails to load", async () => {
  const loading = deferred();
  mockIssue({ get: loading.answer });
  renderAppAt("/issue/WEB-42");

  const crumbs = await screen.findByRole("navigation", { name: "Breadcrumb" });
  expect(within(crumbs).getByRole("link", { name: "Website · WEB" })).toBeTruthy();
  expect(within(crumbs).getByText("WEB-42").getAttribute("aria-current")).toBe("page");

  loading.resolve(apiError(500, "Internal error"));

  expect(await screen.findByText("Couldn’t load this.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
});

it("REQ-016: Enter or leaving the title saves it; Escape restores the saved title", async () => {
  const fetchMock = mockIssue();
  renderAppAt("/issue/WEB-42");

  const title = await titleField();
  fireEvent.change(title, { target: { value: "Something else" } });
  fireEvent.keyDown(title, { key: "Escape" });
  expect(title.value).toBe("Fix login button");

  fireEvent.blur(title);
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([]);

  fireEvent.change(title, { target: { value: "Fix the login button" } });
  fireEvent.keyDown(title, { key: "Enter" });
  await waitFor(() =>
    expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([{ title: "Fix the login button" }]),
  );
  await waitFor(() => expect(title.value).toBe("Fix the login button"));

  fireEvent.change(title, { target: { value: "Fix the Safari login button" } });
  fireEvent.blur(title);
  await waitFor(() =>
    expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([
      { title: "Fix the login button" },
      { title: "Fix the Safari login button" },
    ]),
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

it("REQ-017, REQ-017.1: the Status picker lists statuses in order with the current one checked; Backlog → Done saves", async () => {
  const fetchMock = mockIssue({ shown: issue({ status: "backlog" }) });
  renderAppAt("/issue/WEB-42");

  const listbox = await openPicker("Status");
  expect(keysOf(listbox)).toEqual(["backlog", "in_progress", "in_review", "done", "canceled"]);
  expect(within(listbox).getByRole("option", { name: "Backlog" }).getAttribute("aria-selected")).toBe("true");
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
  expect(keysOf(listbox)).toEqual(["urgent", "high", "medium", "low", "none"]);
  fireEvent.click(within(listbox).getByRole("option", { name: "Urgent" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /^Priority/ }).textContent).toContain("Urgent"),
  );
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([{ priority: "urgent" }]);
});

function assigneesPick() {
  return screen.findByRole("button", { name: /^Assignees/, hidden: true });
}

function memberOption(name: string) {
  return within(screen.getByRole("listbox")).getByRole("option", { name: new RegExp(`^${name}`) });
}

it("REQ-019.1, REQ-019.2, REQ-019.3, REQ-019.4, REQ-019: each toggle saves the whole set; only active members are listed, filtered by name or username", async () => {
  const fetchMock = mockIssue({ shown: issue({ assignees: [memberOf(jordan)] }) });
  renderAppAt("/issue/WEB-42");

  const listbox = await openPicker("Assignees");
  expect(keysOf(listbox)).toEqual(["alex", "jordan", "sam"]);
  expect(memberOption("Jordan Diaz").getAttribute("aria-selected")).toBe("true");

  fireEvent.click(memberOption("Alex Kim"));
  await waitFor(async () => expect((await assigneesPick()).textContent).toContain("Alex Kim, Jordan Diaz"));

  fireEvent.click(memberOption("Alex Kim"));
  await waitFor(async () => expect((await assigneesPick()).textContent).not.toContain("Alex Kim"));

  const search = screen.getByRole("searchbox", { name: "Filter members" });
  fireEvent.change(search, { target: { value: "Sam L" } });
  expect(keysOf(screen.getByRole("listbox"))).toEqual(["sam"]);
  fireEvent.change(search, { target: { value: "jor" } });
  expect(keysOf(screen.getByRole("listbox"))).toEqual(["jordan"]);

  fireEvent.click(memberOption("Jordan Diaz"));
  await waitFor(async () => expect((await assigneesPick()).textContent).toContain("Unassigned"));
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([
    { assignees: ["jordan", "alex"] },
    { assignees: ["jordan"] },
    { assignees: [] },
  ]);
});

it("REQ-019: Enter in the filter adds the first matching member", async () => {
  const fetchMock = mockIssue({ shown: issue({ assignees: [] }) });
  renderAppAt("/issue/WEB-42");

  await openPicker("Assignees");
  const search = screen.getByRole("searchbox", { name: "Filter members" });
  fireEvent.change(search, { target: { value: "jo" } });
  fireEvent.keyDown(search, { key: "Enter" });

  await waitFor(async () => expect((await assigneesPick()).textContent).toContain("Jordan Diaz"));
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([{ assignees: ["jordan"] }]);
});

it("REQ-019.6: a deactivated assignee is shown but not offered, and stays when another member is added", async () => {
  const fetchMock = mockIssue({ shown: issue({ assignees: [memberOf(priya)] }) });
  renderAppAt("/issue/WEB-42");

  expect((await assigneesPick()).textContent).toContain("Priya Shah (deactivated)");
  const listbox = await openPicker("Assignees");
  expect(keysOf(listbox)).toEqual(["alex", "jordan", "sam"]);
  fireEvent.click(memberOption("Jordan Diaz"));

  await waitFor(async () => expect((await assigneesPick()).textContent).toContain("Jordan Diaz"));
  expect((await assigneesPick()).textContent).toContain("Priya Shah (deactivated)");
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([{ assignees: ["priya", "jordan"] }]);
});

it("REQ-019.5: a member deactivated meanwhile gets Choose an active member and the assignees are kept", async () => {
  mockIssue({
    patch: () => apiError(422, "Check the highlighted fields", { assignees: "Choose an active member" }),
  });
  renderAppAt("/issue/WEB-42");

  await openPicker("Assignees");
  fireEvent.click(memberOption("Jordan Diaz"));

  expect(await screen.findByText("Choose an active member")).toBeTruthy();
  expect((await assigneesPick()).textContent).toContain("Alex Kim");
  expect((await assigneesPick()).textContent).not.toContain("Jordan Diaz");
});

it("STD-9: a failed picker save shows the toast and keeps the old value", async () => {
  mockIssue({ patch: () => apiError(500, "Internal error") });
  renderAppAt("/issue/WEB-42");

  const listbox = await openPicker("Priority");
  fireEvent.click(within(listbox).getByRole("option", { name: "Urgent" }));

  expect(await screen.findByText("Couldn’t save. Try again.")).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Priority/ }).textContent).toContain("High");
});

it("REQ-023, REQ-023.1: Cancel closes without deleting; confirming shows Deleting…, deletes and lands on the board", async () => {
  const deletion = deferred();
  const fetchMock = mockIssue({ remove: deletion.answer });
  renderAppAt("/issue/WEB-42");

  fireEvent.click(await screen.findByRole("button", { name: "Delete issue…" }));
  fireEvent.click(
    within(screen.getByRole("alertdialog", { name: "Delete WEB-42?" })).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(requestsTo(fetchMock, "DELETE /api/issues/WEB-42")).toEqual([]);

  fireEvent.click(screen.getByRole("button", { name: "Delete issue…" }));
  const dialog = screen.getByRole("alertdialog", { name: "Delete WEB-42?" });
  expect(
    within(dialog).getByText(
      "“Fix login button” and its comments will be deleted permanently. You can’t undo this.",
    ),
  ).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete issue" }));

  const busy = await within(dialog).findByRole("button", { name: "Deleting…" });
  expect((busy as HTMLButtonElement).disabled).toBe(true);
  deletion.resolve(noContent());

  await waitFor(() => expect(window.location.pathname).toBe("/project/WEB"));
  expect(requestsTo(fetchMock, "DELETE /api/issues/WEB-42")).toHaveLength(1);
});

it("REQ-023.2: a member who didn't create the issue sees no Delete option, while an admin does", async () => {
  mockIssue({ me: alex });
  renderAppAt("/issue/WEB-42");
  await titleField();
  expect(screen.queryByRole("button", { name: "Delete issue…" })).toBeNull();
  cleanup();

  mockIssue({ me: { ...admin, username: "jordan", fullName: "Jordan Diaz", initials: "JD" } });
  renderAppAt("/issue/WEB-42");
  expect(await screen.findByRole("button", { name: "Delete issue…" })).toBeTruthy();
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

it("REQ-013: an archived issue is read-only: title, pickers, labels, description and Delete", async () => {
  mockIssue({
    shown: issue({ archived: true, labels: labelled("bug"), description: "Old text" }),
    inProject: project("WEB", "Website", "2026-10-01T10:00:00.000Z"),
  });
  renderAppAt("/issue/WEB-42");

  expect(await screen.findByRole("heading", { name: "Fix login button" })).toBeTruthy();
  expect(screen.getByText("Archived")).toBeTruthy();
  expect(screen.getByText("In Progress")).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^(Status|Priority|Assignee)/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete issue…" })).toBeNull();

  expect(screen.getByText("bug")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Labels/ })).toBeNull();

  expect(screen.getByText("Old text")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Edit description" })).toBeNull();
});

it("REQ-020: in a project with no labels the label picker opens and says No labels in this project yet.", async () => {
  mockIssue({ labels: () => [] });
  renderAppAt("/issue/WEB-42");

  fireEvent.click(await pick("Labels"));

  expect(await screen.findByText("No labels in this project yet.")).toBeTruthy();
  expect(screen.getByRole("searchbox", { name: "Filter or create labels" })).toBeTruthy();
});

function labelsPick() {
  return screen.findByRole("button", { name: /^Labels/, hidden: true });
}

function labelOption(name: string) {
  return within(screen.getByRole("listbox")).getByRole("option", { name: new RegExp(`^${name}`) });
}

it("REQ-020.1, REQ-020: adding bug and frontend saves each and shows both; unchecking frontend removes it", async () => {
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

  expect(labelOption("frontend").getAttribute("aria-selected")).toBe("true");
  fireEvent.click(labelOption("frontend"));

  await waitFor(async () => expect((await labelsPick()).textContent).not.toContain("frontend"));
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([
    { labelIds: ["l-bug"] },
    { labelIds: ["l-bug", "l-frontend"] },
    { labelIds: ["l-bug"] },
  ]);
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

it("STD-7: an empty description says No description yet. and Add one. opens the editor", async () => {
  mockIssue({ shown: issue({ description: "" }) });
  renderAppAt("/issue/WEB-42");

  expect((await screen.findByText(/^No description yet\./)).textContent).toBe("No description yet. Add one.");
  fireEvent.click(screen.getByRole("button", { name: "Add one." }));

  expect(await screen.findByRole("textbox", { name: "Description (Markdown)" })).toBeTruthy();
});

it("STD-8: a description changed by someone else keeps your text with Save disabled until Reload brings in theirs", async () => {
  let saved = issue({ description: "First text", descriptionVersion: 0 });
  const answers = [
    () => {
      saved = { ...saved, description: "Their text", descriptionVersion: 1 };
      return apiError(409, "This was changed by Alex Kim. Copy your text and reload.");
    },
    () => Response.json({ ...saved, description: "Merged text", descriptionVersion: 2 }),
  ];
  const fetchMock = mockIssue({
    get: () => Response.json(saved),
    patch: () => (answers.shift() as () => Response)(),
  });
  renderAppAt("/issue/WEB-42");

  const editor = await editDescription();
  fireEvent.change(editor, { target: { value: "My version" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("This was changed by Alex Kim. Copy your text and reload.");
  expect(editor.value).toBe("My version");
  expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);

  fireEvent.click(within(alert).getByRole("button", { name: "Reload" }));

  await waitFor(() => expect(editor.value).toBe("Their text"));
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.change(editor, { target: { value: "Merged text" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(screen.queryByRole("textbox", { name: "Description (Markdown)" })).toBeNull());
  expect(requestsTo(fetchMock, "PATCH /api/issues/WEB-42")).toEqual([
    { description: "My version", descriptionVersion: 0 },
    { description: "Merged text", descriptionVersion: 1 },
  ]);
});