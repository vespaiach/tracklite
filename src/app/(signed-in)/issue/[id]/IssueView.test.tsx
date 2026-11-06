import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { ActionResult, Issue, IssueLabel, Label, Me, ProjectSummary } from "../../../../contract";
import { admin, alex, issue, memberOf, sam } from "../../../../test/client-app";
import { done, refused, renderForm } from "../../../../test/forms";
import { type IssueChange, IssueView } from "./IssueView";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  router.push.mockReset();
  router.refresh.mockReset();
});

type Change = { id: string } & IssueChange;
type Answer<Data> = ActionResult<Data> | Promise<ActionResult<Data>>;

const web: ProjectSummary = { key: "WEB", name: "Website", archivedAt: null };
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

function applied(current: Issue, labels: Label[], { id: _id, ...change }: Change): Issue {
  const { assignees, labelIds, ...rest } = change as Partial<Omit<Issue, "assignees">> & {
    assignees?: string[];
    labelIds?: string[];
  };
  return {
    ...current,
    ...rest,
    ...(assignees && {
      assignees: team.filter(({ username }) => assignees.includes(username)).map(memberOf),
    }),
    ...(labelIds && {
      labels: labelIds.map((labelId) => onIssue(labels.find(({ id }) => id === labelId) as Label)),
    }),
    ...(rest.description !== undefined && { descriptionVersion: current.descriptionVersion + 1 }),
  };
}

function renderIssue({
  me = sam,
  shown = issue(),
  labels = webLabels,
  update,
  remove = () => done,
  onRefresh = () => {},
}: {
  me?: Me;
  shown?: Issue;
  labels?: Label[];
  update?: (change: Change) => Answer<Issue | null>;
  remove?: () => Answer<null>;
  onRefresh?: (server: { issue: Issue; labels: Label[] }) => void;
} = {}) {
  const server = { issue: shown, labels: [...labels] };
  const page = { refresh: () => {} };

  async function answered<Data>(answer: Answer<Data>) {
    const result = await answer;
    if (result.ok) page.refresh();
    return result;
  }

  function saved(change: Change): ActionResult<Issue> {
    server.issue = applied(server.issue, server.labels, change);
    return { ok: true, data: server.issue };
  }

  const updateIssue = vi.fn(
    async (change: Change) =>
      answered(update ? update(change) : saved(change)) as Promise<ActionResult<Issue>>,
  );
  const createLabel = vi.fn(async ({ name }: { key: string; name: string }) => {
    const made = { ...label(name), id: "l-new" };
    server.labels.push(made);
    return answered<Label>({ ok: true, data: made });
  });
  const deleteIssue = vi.fn(async (_issue: { id: string }) => answered(remove()));
  router.refresh.mockImplementation(() => {
    onRefresh(server);
    page.refresh();
  });

  function RefreshingPage() {
    const [, setRefreshes] = useState(0);
    page.refresh = () => setRefreshes((count) => count + 1);
    return (
      <IssueView
        issue={server.issue}
        project={web}
        labels={server.labels}
        members={team}
        me={{ username: me.username, admin: me.role === "admin" }}
        comments="The comment thread"
        updateIssue={updateIssue}
        deleteIssue={deleteIssue}
        createLabel={createLabel}
      />
    );
  }

  renderForm(<RefreshingPage />);
  return { updateIssue, createLabel, deleteIssue, server };
}

function changes(updateIssue: ReturnType<typeof renderIssue>["updateIssue"]) {
  return updateIssue.mock.calls.map(([{ id: _id, ...change }]) => change);
}

function deferredResult<Data>() {
  let settle!: (result: ActionResult<Data>) => void;
  const result = new Promise<ActionResult<Data>>((resolve) => {
    settle = resolve;
  });
  return { answer: () => result, settle };
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

it("REQ-016: Enter or leaving the title saves it; Escape restores the saved title", async () => {
  const { updateIssue } = renderIssue();

  const title = await titleField();
  fireEvent.change(title, { target: { value: "Something else" } });
  fireEvent.keyDown(title, { key: "Escape" });
  expect(title.value).toBe("Fix login button");

  fireEvent.blur(title);
  expect(changes(updateIssue)).toEqual([]);

  fireEvent.change(title, { target: { value: "Fix the login button" } });
  fireEvent.keyDown(title, { key: "Enter" });
  await waitFor(() => expect(changes(updateIssue)).toEqual([{ title: "Fix the login button" }]));
  await waitFor(() => expect(title.value).toBe("Fix the login button"));

  fireEvent.change(title, { target: { value: "Fix the Safari login button" } });
  fireEvent.blur(title);
  await waitFor(() =>
    expect(changes(updateIssue)).toEqual([
      { title: "Fix the login button" },
      { title: "Fix the Safari login button" },
    ]),
  );
});

it("REQ-016.3: a title of only spaces gets Title required and keeps what was typed", async () => {
  renderIssue({
    update: () => refused("invalid", "Check the highlighted fields", { title: "Title required" }),
  });

  const title = await titleField();
  fireEvent.change(title, { target: { value: "   " } });
  fireEvent.keyDown(title, { key: "Enter" });

  expect(await screen.findByText("Title required")).toBeTruthy();
  expect(title.value).toBe("   ");
  expect(title.getAttribute("aria-invalid")).toBe("true");
});

it("REQ-017, REQ-017.1: the Status picker lists statuses in order with the current one checked; Backlog → Done saves", async () => {
  const { updateIssue } = renderIssue({ shown: issue({ status: "backlog" }) });

  const listbox = await openPicker("Status");
  expect(keysOf(listbox)).toEqual(["backlog", "in_progress", "in_review", "done", "canceled"]);
  expect(within(listbox).getByRole("option", { name: "Backlog" }).getAttribute("aria-selected")).toBe("true");
  fireEvent.click(within(listbox).getByRole("option", { name: "Done" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /^Status/ }).textContent ?? "").toContain("Done"),
  );
  expect(changes(updateIssue)).toEqual([{ status: "done" }]);
});

it("REQ-018.1: setting the priority to Urgent shows Urgent", async () => {
  const { updateIssue } = renderIssue();

  const listbox = await openPicker("Priority");
  expect(keysOf(listbox)).toEqual(["urgent", "high", "medium", "low", "none"]);
  fireEvent.click(within(listbox).getByRole("option", { name: "Urgent" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /^Priority/ }).textContent).toContain("Urgent"),
  );
  expect(changes(updateIssue)).toEqual([{ priority: "urgent" }]);
});

function assigneesPick() {
  return screen.findByRole("button", { name: /^Assignees/, hidden: true });
}

function memberOption(name: string) {
  return within(screen.getByRole("listbox")).getByRole("option", { name: new RegExp(`^${name}`) });
}

it("REQ-019.1, REQ-019.2, REQ-019.3, REQ-019.4, REQ-019: each toggle saves the whole set; only active members are listed, filtered by name or username", async () => {
  const { updateIssue } = renderIssue({ shown: issue({ assignees: [memberOf(jordan)] }) });

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
  expect(changes(updateIssue)).toEqual([
    { assignees: ["jordan", "alex"] },
    { assignees: ["jordan"] },
    { assignees: [] },
  ]);
});

it("REQ-019: Enter in the filter adds the first matching member", async () => {
  const { updateIssue } = renderIssue({ shown: issue({ assignees: [] }) });

  await openPicker("Assignees");
  const search = screen.getByRole("searchbox", { name: "Filter members" });
  fireEvent.change(search, { target: { value: "jo" } });
  fireEvent.keyDown(search, { key: "Enter" });

  await waitFor(async () => expect((await assigneesPick()).textContent).toContain("Jordan Diaz"));
  expect(changes(updateIssue)).toEqual([{ assignees: ["jordan"] }]);
});

it("REQ-019.6: a deactivated assignee is shown but not offered, and stays when another member is added", async () => {
  const { updateIssue } = renderIssue({ shown: issue({ assignees: [memberOf(priya)] }) });

  expect((await assigneesPick()).textContent).toContain("Priya Shah (deactivated)");
  const listbox = await openPicker("Assignees");
  expect(keysOf(listbox)).toEqual(["alex", "jordan", "sam"]);
  fireEvent.click(memberOption("Jordan Diaz"));

  await waitFor(async () => expect((await assigneesPick()).textContent).toContain("Jordan Diaz"));
  expect((await assigneesPick()).textContent).toContain("Priya Shah (deactivated)");
  expect(changes(updateIssue)).toEqual([{ assignees: ["priya", "jordan"] }]);
});

it("REQ-019.5: a member deactivated meanwhile gets Choose an active member and the assignees are kept", async () => {
  renderIssue({
    update: () =>
      refused("invalid", "Check the highlighted fields", { assignees: "Choose an active member" }),
  });

  await openPicker("Assignees");
  fireEvent.click(memberOption("Jordan Diaz"));

  expect(await screen.findByText("Choose an active member")).toBeTruthy();
  expect((await assigneesPick()).textContent).toContain("Alex Kim");
  expect((await assigneesPick()).textContent).not.toContain("Jordan Diaz");
});

it("STD-9: a failed picker save shows the toast and keeps the old value", async () => {
  renderIssue({ update: () => Promise.reject(new TypeError("Failed to fetch")) });

  const listbox = await openPicker("Priority");
  fireEvent.click(within(listbox).getByRole("option", { name: "Urgent" }));

  expect(await screen.findByText("Couldn’t save. Try again.")).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Priority/ }).textContent).toContain("High");
});

it("REQ-023, REQ-023.1: Cancel closes without deleting; confirming shows Deleting…, deletes and lands on the board", async () => {
  const deletion = deferredResult<null>();
  const { deleteIssue } = renderIssue({ remove: deletion.answer });

  fireEvent.click(await screen.findByRole("button", { name: "Delete issue…" }));
  fireEvent.click(
    within(screen.getByRole("alertdialog", { name: "Delete WEB-42?" })).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(deleteIssue).not.toHaveBeenCalled();

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
  deletion.settle(done);

  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/project/WEB"));
  expect(deleteIssue.mock.calls).toEqual([[{ id: "WEB-42" }]]);
});

it("REQ-023.2: a member who didn't create the issue sees no Delete option, while an admin does", async () => {
  renderIssue({ me: alex });
  await titleField();
  expect(screen.queryByRole("button", { name: "Delete issue…" })).toBeNull();
  cleanup();

  renderIssue({ me: { ...admin, username: "jordan", fullName: "Jordan Diaz", initials: "JD" } });
  expect(await screen.findByRole("button", { name: "Delete issue…" })).toBeTruthy();
});

it("REQ-013: an archived issue is read-only: title, pickers, labels, description and Delete", async () => {
  renderIssue({
    shown: issue({ archived: true, labels: labelled("bug"), description: "Old text" }),
  });

  expect(await screen.findByRole("heading", { name: "Fix login button" })).toBeTruthy();
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
  renderIssue({ labels: [] });

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
  const { updateIssue } = renderIssue();

  await openPicker("Labels");
  fireEvent.click(labelOption("bug"));
  await waitFor(async () => expect((await labelsPick()).textContent).toContain("bug"));
  fireEvent.click(labelOption("frontend"));

  await waitFor(async () => expect((await labelsPick()).textContent).toContain("frontend"));
  expect((await labelsPick()).textContent).toContain("bug");
  expect(changes(updateIssue)).toEqual([{ labelIds: ["l-bug"] }, { labelIds: ["l-bug", "l-frontend"] }]);

  expect(labelOption("frontend").getAttribute("aria-selected")).toBe("true");
  fireEvent.click(labelOption("frontend"));

  await waitFor(async () => expect((await labelsPick()).textContent).not.toContain("frontend"));
  expect(changes(updateIssue)).toEqual([
    { labelIds: ["l-bug"] },
    { labelIds: ["l-bug", "l-frontend"] },
    { labelIds: ["l-bug"] },
  ]);
});

it("REQ-020.2: typing a name that doesn't exist creates it as Gray and adds it", async () => {
  const { updateIssue, createLabel } = renderIssue({
    labels: webLabels.filter(({ name }) => name !== "Design"),
  });

  await openPicker("Labels");
  fireEvent.change(screen.getByRole("searchbox", { name: "Filter or create labels" }), {
    target: { value: "Design" },
  });
  fireEvent.click(labelOption("Create label “Design”"));

  await waitFor(async () => expect((await labelsPick()).textContent).toContain("Design"));
  expect(createLabel.mock.calls).toEqual([[{ key: "WEB", name: "Design", color: "gray" }]]);
  expect(changes(updateIssue)).toEqual([{ labelIds: ["l-new"] }]);
});

it("REQ-020.5: typing a name that differs only in capitals adds the existing label", async () => {
  const { updateIssue, createLabel } = renderIssue();

  await openPicker("Labels");
  fireEvent.change(screen.getByRole("searchbox", { name: "Filter or create labels" }), {
    target: { value: "design" },
  });
  expect(keysOf(screen.getByRole("listbox"))).toEqual(["l-design"]);
  fireEvent.click(labelOption("Design"));

  await waitFor(async () => expect((await labelsPick()).textContent).toContain("Design"));
  expect(createLabel).not.toHaveBeenCalled();
  expect(changes(updateIssue)).toEqual([{ labelIds: ["l-design"] }]);
});

it("REQ-020.3: adding an 11th label shows Maximum 10 labels and keeps the labels", async () => {
  renderIssue({
    shown: issue({ labels: labelled("bug") }),
    update: () => refused("invalid", "Check the highlighted fields", { labelIds: "Maximum 10 labels" }),
  });

  await openPicker("Labels");
  fireEvent.click(labelOption("docs"));

  const error = await screen.findByText("Maximum 10 labels");
  const labels = await labelsPick();
  expect(labels.textContent).not.toContain("docs");
  expect(labels.getAttribute("aria-describedby")).toContain(error.closest("[id]")?.id);
});

it("REQ-020.4: a label deleted meanwhile shows the toast, keeps the other labels and refreshes the page", async () => {
  renderIssue({
    shown: issue({ labels: labelled("bug", "docs") }),
    update: () => refused("notFound", "That label no longer exists"),
    onRefresh: (server) => {
      server.labels = server.labels.filter(({ name }) => name !== "frontend");
    },
  });

  await openPicker("Labels");
  fireEvent.click(labelOption("frontend"));

  expect(await screen.findByText("That label no longer exists")).toBeTruthy();
  const labels = await labelsPick();
  expect(labels.textContent).toContain("bug");
  expect(labels.textContent).toContain("docs");
  await waitFor(() => expect(screen.queryByRole("option", { name: /^frontend/ })).toBeNull());
  expect(router.refresh).toHaveBeenCalledOnce();
});

async function editDescription() {
  fireEvent.click(await screen.findByRole("button", { name: "Edit description" }));
  return (await screen.findByRole("textbox", { name: "Description (Markdown)" })) as HTMLTextAreaElement;
}

it("REQ-022.1: saving a description with a checklist and a code block shows it formatted", async () => {
  const { updateIssue } = renderIssue();

  const editor = await editDescription();
  const text = "- [x] Reproduce in Safari\n\n```js\nsignIn();\n```";
  fireEvent.change(editor, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("checkbox")).toBeTruthy();
  expect(document.querySelector("pre")?.textContent).toContain("signIn();");
  expect(screen.queryByRole("textbox", { name: "Description (Markdown)" })).toBeNull();
  expect(changes(updateIssue)).toEqual([{ description: text, descriptionVersion: 0 }]);
});

it("STD-7: an empty description says No description yet. and Add one. opens the editor", async () => {
  renderIssue({ shown: issue({ description: "" }) });

  expect((await screen.findByText(/^No description yet\./)).textContent).toBe("No description yet. Add one.");
  fireEvent.click(screen.getByRole("button", { name: "Add one." }));

  expect(await screen.findByRole("textbox", { name: "Description (Markdown)" })).toBeTruthy();
});

it("STD-8: a description changed by someone else keeps your text with Save disabled until Reload brings in theirs", async () => {
  const theirs = issue({ description: "Their text", descriptionVersion: 1 });
  const answers = [
    () => refused("conflict", "This was changed by Alex Kim. Copy your text and reload."),
    () => ({ ok: true, data: { ...theirs, description: "Merged text", descriptionVersion: 2 } }) as const,
  ];
  const { updateIssue } = renderIssue({
    shown: issue({ description: "First text", descriptionVersion: 0 }),
    update: () => (answers.shift() as () => ActionResult<Issue>)(),
    onRefresh: (server) => {
      server.issue = theirs;
    },
  });

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
  expect(changes(updateIssue)).toEqual([
    { description: "My version", descriptionVersion: 0 },
    { description: "Merged text", descriptionVersion: 1 },
  ]);
});

it("NFR-007: Edit moves focus into the description editor; Escape and Save return it to Edit", async () => {
  renderIssue();

  const escaping = await editDescription();
  await waitFor(() => expect(document.activeElement).toBe(escaping));
  fireEvent.keyDown(escaping, { key: "Escape" });
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit description" })),
  );

  const saving = await editDescription();
  await waitFor(() => expect(document.activeElement).toBe(saving));
  fireEvent.change(saving, { target: { value: "New text" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit description" })),
  );
});