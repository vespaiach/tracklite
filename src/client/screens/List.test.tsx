import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  alex,
  apiError,
  memberOf,
  mockApi,
  project,
  renderAppAt,
  requestsTo,
  sam,
} from "../../test/client-app";
import type { IssueLabel, IssueListPage, Label, ListIssue, Me, Project } from "../api";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const listPath = "/api/projects/WEB/issues";

const web = project("WEB", "Website");
const archivedWeb = project("WEB", "Website", "2026-09-30T10:00:00.000Z");

const jo: Me = {
  username: "jo",
  fullName: "Jo Park",
  initials: "JP",
  deactivated: true,
  email: "jo@acme.com",
  role: "member",
};
const kim: Me = { ...jo, username: "kim", fullName: "Kim Wu", initials: "KW", email: "kim@acme.com" };

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function labels(...names: string[]): IssueLabel[] {
  return names.map((name) => ({ id: `l-${name.toLowerCase()}`, name, color: "gray" }));
}

function projectLabel(name: string): Label {
  return { id: `l-${name}`, name, color: "gray", issueCount: 1 };
}

function row(id: string, title: string, overrides: Partial<ListIssue> = {}): ListIssue {
  return {
    id,
    title,
    status: "backlog",
    priority: "medium",
    assignee: memberOf(alex),
    labels: [],
    updatedAt: minutesAgo(5),
    ...overrides,
  };
}

const web42 = row("WEB-42", "Fix login button", {
  status: "in_progress",
  priority: "high",
  assignee: memberOf(sam),
  labels: labels("bug", "frontend", "Safari"),
});
const web12 = row("WEB-12", "Tidy up footer links", {
  priority: "none",
  assignee: null,
  updatedAt: "2026-09-16T12:00:00.000Z",
});
const web7 = row("WEB-7", "Add password rules to the reset form", { assignee: memberOf(jo) });

function page(issues: ListIssue[], overrides: Partial<IssueListPage> = {}): IssueListPage {
  return { issues, hasMore: false, deactivatedAssignees: [memberOf(jo)], ...overrides };
}

type ListAnswer = (query: URLSearchParams) => IssueListPage | Response | Promise<Response>;

function mockList({
  shown = web,
  list = () => page([web42, web12, web7]),
  projectLabels = [projectLabel("bug"), projectLabel("frontend")],
}: {
  shown?: Project;
  list?: ListAnswer;
  projectLabels?: Label[];
} = {}) {
  const fetchMock = mockApi({
    "GET /api/me": () => Response.json(sam),
    "GET /api/members": () => Response.json([sam, alex, jo, kim]),
    "GET /api/projects/WEB": () => Response.json(shown),
    "GET /api/projects/WEB/labels": () => Response.json(projectLabels),
  });
  const routes = fetchMock.getMockImplementation();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "GET" && (url === listPath || url.startsWith(`${listPath}?`))) {
      const answer = await list(new URL(url, "http://tracklite.test").searchParams);
      return answer instanceof Response ? answer : Response.json(answer);
    }
    if (!routes) throw new Error("No API routes");
    return routes(url, init);
  });
  return fetchMock;
}

function listQueries(fetchMock: ReturnType<typeof mockApi>) {
  const queries = fetchMock.mock.calls
    .map(([url, init]) => ((init?.method ?? "GET") === "GET" ? String(url) : ""))
    .filter((url) => url === listPath || url.startsWith(`${listPath}?`))
    .map((url) => url.slice(listPath.length));
  return [...new Set(queries)];
}

function filters() {
  const search = screen.getByRole("searchbox", { name: "Search issues", hidden: true });
  return search.closest("search") as HTMLElement;
}

function filterButton(field: string) {
  return within(filters()).getByRole("button", { name: new RegExp(`^${field}`), hidden: true });
}

async function openFilter(field: string) {
  await screen.findByRole("searchbox", { name: "Search issues" });
  fireEvent.click(filterButton(field));
  return screen.findByRole("listbox");
}

async function closeFilter() {
  fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
}

function ruleText(field: string) {
  const rule = filterButton(field).closest(".tl-filter-rule");
  return [...(rule?.querySelectorAll(".tl-filter-rule__seg") ?? [])].map((seg) => seg.textContent).join("");
}

function keysOf(listbox: HTMLElement) {
  return within(listbox)
    .getAllByRole("option")
    .map((option) => option.getAttribute("data-key"));
}

function heading(name: string) {
  return screen.getByRole("columnheader", { name });
}

function sortBy(name: string) {
  fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name }));
}

function rowOf(id: string) {
  const cell = within(screen.getByRole("table")).getByText(id);
  return cell.closest("tr") as HTMLElement;
}

function rowIds() {
  return within(screen.getByRole("table"))
    .queryAllByText(/^WEB-\d+$/)
    .map((cell) => cell.textContent);
}

it("REQ-040.1: a shared link opens the same filtered, sorted list", async () => {
  const fetchMock = mockList();
  renderAppAt("/project/WEB/list?assignee=alex&sort=priority&dir=asc");

  await screen.findByRole("table");
  expect(listQueries(fetchMock)).toEqual(["?assignee=alex&sort=priority&dir=asc"]);
  await waitFor(() => expect(ruleText("Assignee")).toBe("AssigneeisAlex Kim×"));
  expect(heading("Priority").getAttribute("aria-sort")).toBe("ascending");
  expect(heading("Last updated").getAttribute("aria-sort")).toBe("none");
});

it("REQ-040.2: a deleted label in a link is ignored and the Done filter still applies", async () => {
  mockList({ projectLabels: [projectLabel("bug"), projectLabel("backend")] });
  renderAppAt("/project/WEB/list?label=frontend&status=done");

  await screen.findByRole("table");
  expect(ruleText("Status")).toBe("StatusisDone×");
  const listbox = await openFilter("Label");
  const options = within(listbox).getAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual(["backend", "bug"]);
  for (const option of options) expect(option.getAttribute("aria-selected")).toBe("false");
  await closeFilter();
  expect(filterButton("Label").classList.contains("tl-filter-add")).toBe(true);
});

it("REQ-040.3: an unknown status in a link is ignored", async () => {
  mockList();
  renderAppAt("/project/WEB/list?status=Todo");

  await screen.findByRole("table");
  expect(filterButton("Status").classList.contains("tl-filter-add")).toBe(true);
  expect(rowIds()).toEqual(["WEB-42", "WEB-12", "WEB-7"]);
});

it("REQ-040: filters and sort round-trip through the address as repeated parameters", async () => {
  const fetchMock = mockList();
  renderAppAt("/project/WEB/list");
  await screen.findByRole("table");

  const listbox = await openFilter("Status");
  fireEvent.click(within(listbox).getByRole("option", { name: "In Progress" }));
  fireEvent.click(within(listbox).getByRole("option", { name: "In Review" }));
  await waitFor(() => expect(window.location.search).toBe("?status=in_progress&status=in_review"));
  expect(ruleText("Status")).toBe("Statusis any ofIn Progress, In Review×");
  await closeFilter();

  sortBy("Priority");
  await waitFor(() =>
    expect(window.location.search).toBe("?status=in_progress&status=in_review&sort=priority&dir=asc"),
  );
  sortBy("Priority");
  await waitFor(() =>
    expect(window.location.search).toBe("?status=in_progress&status=in_review&sort=priority&dir=desc"),
  );
  await waitFor(() =>
    expect(listQueries(fetchMock)).toEqual([
      "",
      "?status=in_progress",
      "?status=in_progress&status=in_review",
      "?status=in_progress&status=in_review&sort=priority&dir=asc",
      "?status=in_progress&status=in_review&sort=priority&dir=desc",
    ]),
  );
});

it("REQ-038: search waits until 300 ms after typing stops", async () => {
  const fetchMock = mockList();
  renderAppAt("/project/WEB/list");
  await screen.findByRole("table");
  const search = screen.getByRole("searchbox", { name: "Search issues" });

  vi.useFakeTimers();
  fireEvent.change(search, { target: { value: "login" } });
  act(() => vi.advanceTimersByTime(200));
  fireEvent.change(search, { target: { value: "login button" } });
  act(() => vi.advanceTimersByTime(299));
  expect(window.location.search).toBe("");
  expect(listQueries(fetchMock)).toEqual([""]);

  act(() => vi.advanceTimersByTime(1));
  vi.useRealTimers();
  await waitFor(() => expect(window.location.search).toBe("?q=login+button"));
  await waitFor(() => expect(listQueries(fetchMock)).toEqual(["", "?q=login+button"]));
});

it("REQ-037.4: nothing matches → Clear filters, which clears the filters and the search", async () => {
  mockList({ list: (query) => page(query.size > 0 ? [] : [web42, web12, web7]) });
  renderAppAt("/project/WEB/list?status=done&q=invoice");

  const table = await screen.findByRole("table");
  await within(table).findByText("No issues match these filters");
  expect((screen.getByRole("searchbox", { name: "Search issues" }) as HTMLInputElement).value).toBe(
    "invoice",
  );

  fireEvent.click(within(table).getByRole("button", { name: "Clear filters" }));
  await waitFor(() => expect(window.location.search).toBe(""));
  expect((screen.getByRole("searchbox", { name: "Search issues" }) as HTMLInputElement).value).toBe("");
  expect(filterButton("Status").classList.contains("tl-filter-add")).toBe(true);
  await waitFor(() => expect(rowIds()).toEqual(["WEB-42", "WEB-12", "WEB-7"]));
});

it("List — default: the columns, and each row's cells", async () => {
  mockList();
  renderAppAt("/project/WEB/list");

  const table = await screen.findByRole("table");
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((head) => head.textContent),
  ).toEqual(["ID", "Title", "Status", "Priority", "Assignee", "Labels", "Last updated"]);

  const r42 = rowOf("WEB-42");
  expect(within(r42).getByRole("link", { name: "Fix login button" }).getAttribute("href")).toBe(
    "/issue/WEB-42",
  );
  for (const text of ["In Progress", "High", "Sam Lee", "bug", "frontend", "+1", "5 min ago"]) {
    expect(within(r42).getByText(text)).toBeTruthy();
  }
  expect(within(r42).queryByText("Safari")).toBeNull();

  const r12 = rowOf("WEB-12");
  for (const text of ["Unassigned", "No priority"]) expect(within(r12).getByText(text)).toBeTruthy();
  expect(within(r12).getByText(/^Sep 16/)).toBeTruthy();

  expect(within(rowOf("WEB-7")).getByText("Jo Park (deactivated)")).toBeTruthy();
});

it("REQ-039: newest-updated first by default; ID starts highest first, Status from Backlog", async () => {
  mockList();
  renderAppAt("/project/WEB/list");

  await screen.findByRole("table");
  expect(heading("Last updated").getAttribute("aria-sort")).toBe("descending");
  sortBy("ID");
  await waitFor(() => expect(window.location.search).toBe("?sort=id&dir=desc"));
  expect(heading("ID").getAttribute("aria-sort")).toBe("descending");
  sortBy("Status");
  await waitFor(() => expect(window.location.search).toBe("?sort=status&dir=asc"));
  sortBy("Last updated");
  await waitFor(() => expect(window.location.search).toBe("?sort=updated&dir=desc"));
});

it("REQ-036.1: 120 issues → 100 rows, and the other 20 load on scrolling down", async () => {
  const observers: IntersectionObserverCallback[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observers.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const issues = Array.from({ length: 120 }, (_, index) => row(`WEB-${120 - index}`, `Issue ${120 - index}`));
  let sendRest: (response: Response) => void = () => {};
  const fetchMock = mockList({
    list: (query) =>
      query.get("offset") === "100"
        ? new Promise<Response>((resolve) => {
            sendRest = resolve;
          })
        : page(issues.slice(0, 100), { hasMore: true }),
  });
  renderAppAt("/project/WEB/list");

  await screen.findByRole("table");
  expect(rowIds()).toHaveLength(100);
  act(() =>
    observers.at(-1)?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
  );
  expect(await screen.findByText("Loading more…")).toBeTruthy();
  expect(listQueries(fetchMock)).toEqual(["", "?offset=100"]);

  await act(async () => sendRest(Response.json(page(issues.slice(100)))));
  await waitFor(() => expect(rowIds()).toHaveLength(120));
  expect(rowIds().at(-1)).toBe("WEB-1");
  expect(screen.queryByText("Loading more…")).toBeNull();
});

it("REQ-037.2, REQ-037.5: the Assignee filter offers Unassigned, active members and Jo Park (deactivated)", async () => {
  const fetchMock = mockList();
  renderAppAt("/project/WEB/list");
  await screen.findByRole("table");

  const listbox = await openFilter("Assignee");
  await waitFor(() => expect(keysOf(listbox)).toEqual(["-", "alex", "sam", "jo"]));
  for (const name of ["Unassigned", "Alex Kim", "Sam Lee", "Jo Park (deactivated)"]) {
    expect(within(listbox).getByRole("option", { name })).toBeTruthy();
  }
  expect(within(listbox).queryByRole("option", { name: /Kim Wu/ })).toBeNull();
  fireEvent.click(within(listbox).getByRole("option", { name: "Unassigned" }));
  await waitFor(() => expect(window.location.search).toBe("?assignee=-"));
  fireEvent.click(within(listbox).getByRole("option", { name: "Jo Park (deactivated)" }));
  await waitFor(() => expect(window.location.search).toBe("?assignee=-&assignee=jo"));
  expect(ruleText("Assignee")).toBe("Assigneeis any ofUnassigned, Jo Park (deactivated)×");
  await waitFor(() => expect(listQueries(fetchMock)).toContain("?assignee=-&assignee=jo"));
});

it("List — empty project: “Create one.” opens New issue", async () => {
  mockList({ list: () => page([]) });
  renderAppAt("/project/WEB/list");

  expect(await screen.findByText(/No issues yet\./)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Create one." }));
  expect(screen.getByRole("dialog", { name: "New issue" })).toBeTruthy();
});

it("List — load failure: Couldn't load this. and Retry loads again", async () => {
  let attempts = 0;
  mockList({
    list: () => {
      attempts += 1;
      return attempts === 1 ? apiError(500, "Server error") : page([web42]);
    },
  });
  renderAppAt("/project/WEB/list");

  expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(rowIds()).toEqual(["WEB-42"]));
});

it("REQ-036.4: a title too long for its cell shows in full on hover and keyboard focus", async () => {
  const long =
    `Sign-in page shows the wrong error after a password reset link expires, ${"and more ".repeat(16)}`.slice(
      0,
      200,
    );
  mockList({ list: () => page([row("WEB-61", long), web12]) });
  renderAppAt("/project/WEB/list");
  await screen.findByRole("table");

  const short = screen.getByRole("link", { name: "Tidy up footer links" });
  fireEvent.mouseEnter(short);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.mouseLeave(short);

  const link = screen.getByRole("link", { name: long });
  Object.defineProperty(link, "scrollWidth", { value: 900 });
  Object.defineProperty(link, "clientWidth", { value: 300 });
  fireEvent.mouseEnter(link);
  expect(screen.getByRole("tooltip").textContent).toBe(long);
  fireEvent.mouseLeave(link);
  expect(screen.queryByRole("tooltip")).toBeNull();

  const matches = link.matches.bind(link);
  vi.spyOn(link, "matches").mockImplementation(
    (selector) => selector === ":focus-visible" || matches(selector),
  );
  act(() => link.focus());
  expect(screen.getByRole("tooltip").textContent).toBe(long);
});

it("REQ-036.3: an archived project's list has no New issue, but filters and sort still work", async () => {
  const fetchMock = mockList({ shown: archivedWeb });
  renderAppAt("/project/WEB/list");
  await screen.findByRole("table");

  expect(screen.queryByRole("button", { name: "New issue" })).toBeNull();
  const listbox = await openFilter("Priority");
  fireEvent.click(within(listbox).getByRole("option", { name: "Urgent" }));
  await closeFilter();
  sortBy("Status");
  await waitFor(() => expect(window.location.search).toBe("?priority=urgent&sort=status&dir=asc"));
  await waitFor(() => expect(listQueries(fetchMock)).toContain("?priority=urgent&sort=status&dir=asc"));
  expect(requestsTo(fetchMock, "POST /api/projects/WEB/issues")).toEqual([]);
});