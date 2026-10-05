import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  admin,
  alex,
  apiError,
  issue,
  memberOf,
  mockApi,
  noContent,
  project,
  renderAppAt,
  requestsTo,
  sam,
} from "../../test/client-app";
import type { Issue, Me, Project } from "../api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Answer = (body: unknown) => Response | Promise<Response>;

const web = project("WEB", "Website");
const jordan: Me = { ...alex, username: "jordan", fullName: "Jordan Diaz", initials: "JD" };
const priya: Me = { ...alex, username: "priya", fullName: "Priya Shah", initials: "PS", deactivated: true };
const team = [alex, jordan, priya, sam];

function mockIssue({
  me = sam,
  shown = issue(),
  inProject = web,
  patch,
}: {
  me?: Me;
  shown?: Issue;
  inProject?: Project;
  patch?: Answer;
} = {}) {
  let current: Issue | undefined = shown;
  return mockApi({
    "GET /api/me": () => Response.json(me),
    "GET /api/members": () => Response.json(team),
    [`GET /api/projects/${inProject.key}`]: () => Response.json(inProject),
    [`GET /api/issues/${shown.id}`]: () => (current ? Response.json(current) : apiError(404, "Not found")),
    [`PATCH /api/issues/${shown.id}`]:
      patch ??
      ((body) => {
        const change = body as Partial<Omit<Issue, "assignee">> & { assignee?: string | null };
        const { assignee, ...rest } = change;
        const member = team.find((candidate) => candidate.username === assignee);
        current = {
          ...(current as Issue),
          ...rest,
          ...(assignee !== undefined && { assignee: member ? memberOf(member) : null }),
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