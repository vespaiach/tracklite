import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { startTransition, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { formatExact } from "../../../../../client/dates";
import type {
  IssueLabel,
  IssueListPage,
  Label,
  ListIssue,
  MemberSummary,
  ProjectSummary,
} from "../../../../../contract";
import { renderForm } from "../../../../../test/forms";
import type { CreateIssue } from "../NewIssueDialog";
import { IssueList, type MoreIssues } from "./IssueList";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("../../../../../lib/load-page", () => ({ loadPage: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  router.push.mockReset();
  router.replace.mockReset();
});

const web: ProjectSummary = { key: "WEB", name: "Website", archivedAt: null };
const archivedWeb: ProjectSummary = { ...web, archivedAt: "2026-09-30T10:00:00.000Z" };

const sam: MemberSummary = { username: "sam", fullName: "Sam Lee", initials: "SL", deactivated: false };
const alex: MemberSummary = { username: "alex", fullName: "Alex Kim", initials: "AK", deactivated: false };
const jo: MemberSummary = { username: "jo", fullName: "Jo Park", initials: "JP", deactivated: true };
const kim: MemberSummary = { username: "kim", fullName: "Kim Wu", initials: "KW", deactivated: true };
const nina: MemberSummary = { username: "nina", fullName: "Nina Shah", initials: "NS", deactivated: false };

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
    assignees: [alex],
    labels: [],
    updatedAt: minutesAgo(5),
    ...overrides,
  };
}

const web42 = row("WEB-42", "Fix login button", {
  status: "in_progress",
  priority: "high",
  assignees: [sam],
  labels: labels("bug", "frontend", "Safari"),
});
const web12 = row("WEB-12", "Tidy up footer links", {
  priority: "none",
  assignees: [],
  updatedAt: "2026-09-16T12:00:00.000Z",
});
const web7 = row("WEB-7", "Add password rules to the reset form", {
  assignees: [alex, jo, kim, nina, sam],
});

function page(issues: ListIssue[], overrides: Partial<IssueListPage> = {}): IssueListPage {
  return { issues, hasMore: false, deactivatedAssignees: [jo], ...overrides };
}

function searchOf(address: string) {
  return new URL(address, "http://tracklite.test").search.slice(1);
}

function renderList({
  shown = web,
  at = "",
  list = () => page([web42, web12, web7]),
  projectLabels = [projectLabel("bug"), projectLabel("frontend")],
  moreIssues = vi.fn<MoreIssues>(),
}: {
  shown?: ProjectSummary;
  at?: string;
  list?: (query: URLSearchParams) => IssueListPage;
  projectLabels?: Label[];
  moreIssues?: MoreIssues;
} = {}) {
  const createIssue = vi.fn<CreateIssue>();

  function ListAt() {
    const [query, setQuery] = useState(at);
    const navigate = (address: string) => startTransition(() => setQuery(searchOf(address)));
    router.push.mockImplementation(navigate);
    router.replace.mockImplementation(navigate);
    return (
      <IssueList
        project={shown}
        query={query}
        page={list(new URLSearchParams(query))}
        labels={projectLabels}
        members={[sam, alex, jo, kim]}
        me="sam"
        createIssue={createIssue}
        moreIssues={moreIssues}
      />
    );
  }

  renderForm(<ListAt />);
  return { createIssue };
}

function addresses(navigation: typeof router.push) {
  return navigation.mock.calls.map(([address]) => address);
}

function filters() {
  const search = screen.getByRole("searchbox", { name: "Search issues", hidden: true });
  return search.closest("search") as HTMLElement;
}

function filterButton(field: string) {
  return within(filters()).getByRole("button", { name: new RegExp(`^${field}`), hidden: true });
}

async function openFilter(field: string) {
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

function issueList() {
  return screen.getByRole("main", { name: "Issues" });
}

function sortButtons() {
  return within(screen.getByRole("group", { name: "Sort issues" }))
    .getAllByRole("button")
    .map((button) => button.textContent);
}

function sortBy(name: string) {
  const head = screen.getByRole("group", { name: "Sort issues" });
  fireEvent.click(within(head).getByRole("button", { name: new RegExp(`^${name}`) }));
}

function rowOf(id: string) {
  return screen.getByRole("link", { name: new RegExp(`^${id}, `) });
}

function rowIds() {
  return within(issueList())
    .queryAllByText(/^WEB-\d+$/)
    .map((cell) => cell.textContent);
}

it("REQ-040.1: a shared link opens the same filtered, sorted list", () => {
  const list = vi.fn((_query: URLSearchParams) => page([web42]));
  renderList({ at: "assignee=alex&sort=priority&dir=asc", list });

  expect(String(list.mock.calls[0][0])).toBe("assignee=alex&sort=priority&dir=asc");
  expect(ruleText("Assignee")).toBe("AssigneeisAlex Kim×");
  expect(sortButtons()).toEqual(["ID", "Status", "Priority, sorted ascending", "Last updated"]);
});

it("REQ-040.2, REQ-040.3: a deleted label and an unknown status in a link are ignored; Done still applies", async () => {
  renderList({
    at: "label=frontend&status=done&status=Todo",
    projectLabels: [projectLabel("bug"), projectLabel("backend")],
  });

  expect(ruleText("Status")).toBe("StatusisDone×");
  expect(rowIds()).toEqual(["WEB-42", "WEB-12", "WEB-7"]);

  const listbox = await openFilter("Label");
  const options = within(listbox).getAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual(["backend", "bug"]);
  for (const option of options) expect(option.getAttribute("aria-selected")).toBe("false");
  await closeFilter();
  expect(filterButton("Label").classList.contains("tl-filter-add")).toBe(true);
});

it("REQ-040: filters and sort push the address as repeated parameters", async () => {
  renderList();

  const listbox = await openFilter("Status");
  fireEvent.click(within(listbox).getByRole("option", { name: "In Progress" }));
  fireEvent.click(within(listbox).getByRole("option", { name: "In Review" }));
  await waitFor(() => expect(ruleText("Status")).toBe("Statusis any ofIn Progress, In Review×"));
  await closeFilter();

  sortBy("Priority");
  sortBy("Priority");
  await waitFor(() => expect(sortButtons()[2]).toBe("Priority, sorted descending"));
  expect(addresses(router.push)).toEqual([
    "/project/WEB/list?status=in_progress",
    "/project/WEB/list?status=in_progress&status=in_review",
    "/project/WEB/list?status=in_progress&status=in_review&sort=priority&dir=asc",
    "/project/WEB/list?status=in_progress&status=in_review&sort=priority&dir=desc",
  ]);
  expect(router.push.mock.calls[0][1]).toEqual({ scroll: false });
  expect(router.replace).not.toHaveBeenCalled();
});

it("REQ-038: search waits until 300 ms after typing stops, and replaces the address", () => {
  renderList();
  const search = screen.getByRole("searchbox", { name: "Search issues" });

  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fireEvent.change(search, { target: { value: "login" } });
  act(() => vi.advanceTimersByTime(200));
  fireEvent.change(search, { target: { value: "login button" } });
  act(() => vi.advanceTimersByTime(299));
  expect(router.replace).not.toHaveBeenCalled();

  act(() => vi.advanceTimersByTime(1));
  expect(addresses(router.replace)).toEqual(["/project/WEB/list?q=login+button"]);
  expect(router.push).not.toHaveBeenCalled();
  expect((search as HTMLInputElement).value).toBe("login button");
});

it("REQ-037.4: nothing matches → Clear filters, which clears the filters and the search", async () => {
  renderList({
    at: "status=done&q=invoice",
    list: (query) => page(query.size > 0 ? [] : [web42, web12, web7]),
  });

  const list = issueList();
  expect(within(list).getByText("No issues match these filters")).toBeTruthy();
  expect((screen.getByRole("searchbox", { name: "Search issues" }) as HTMLInputElement).value).toBe(
    "invoice",
  );

  fireEvent.click(within(list).getByRole("button", { name: "Clear filters" }));
  expect(addresses(router.push)).toEqual(["/project/WEB/list"]);
  expect((screen.getByRole("searchbox", { name: "Search issues" }) as HTMLInputElement).value).toBe("");
  await waitFor(() => expect(rowIds()).toEqual(["WEB-42", "WEB-12", "WEB-7"]));
  expect(filterButton("Status").classList.contains("tl-filter-add")).toBe(true);
});

it("REQ-039, REQ-036.4, REQ-025.3: default columns and row cells; 5 assignees show 3 avatars and +2; newest-updated first; ID starts highest first, Status from Backlog", async () => {
  renderList();

  expect(sortButtons()).toEqual(["ID", "Status", "Priority", "Last updated, sorted descending"]);

  const r42 = rowOf("WEB-42");
  expect(r42.getAttribute("aria-label")).toBe(
    `WEB-42, Fix login button, In Progress, High, assigned to Sam Lee, updated ${formatExact(web42.updatedAt)}`,
  );
  expect(r42.getAttribute("href")).toBe("/issue/WEB-42");
  expect(within(r42).getByText("Fix login button").getAttribute("title")).toBe("Fix login button");
  for (const text of ["In Progress", "High", "bug", "frontend", "+1"]) {
    expect(within(r42).getByText(text)).toBeTruthy();
  }
  expect(within(r42).getByTitle("Sam Lee").textContent).toBe("SL");
  expect(within(r42).getByText("5 min ago").getAttribute("title")).toBe(
    `Updated ${formatExact(web42.updatedAt)}`,
  );
  expect(within(r42).queryByText("Safari")).toBeNull();

  const r12 = rowOf("WEB-12");
  expect(within(r12).getByText("No priority")).toBeTruthy();
  expect(within(r12).getByTitle("Unassigned").textContent).toBe("");
  expect(r12.getAttribute("aria-label")).toContain(", No priority, unassigned, updated ");
  expect(within(r12).getByText(/^Sep 16/)).toBeTruthy();

  const r7 = rowOf("WEB-7");
  const everyone = "Alex Kim, Jo Park (deactivated), Kim Wu (deactivated), Nina Shah, Sam Lee";
  expect(r7.getAttribute("aria-label")).toContain(`, assigned to ${everyone}, `);
  const stack = within(r7).getByTitle(everyone);
  expect([...stack.querySelectorAll(".tl-avatar")].map((avatar) => avatar.textContent)).toEqual([
    "AK",
    "JP",
    "KW",
  ]);
  expect(within(stack).getByText("+2")).toBeTruthy();

  sortBy("ID");
  await waitFor(() => expect(sortButtons()[0]).toBe("ID, sorted descending"));
  sortBy("Status");
  await waitFor(() => expect(sortButtons()[1]).toBe("Status, sorted ascending"));
  sortBy("Last updated");
  expect(addresses(router.push)).toEqual([
    "/project/WEB/list?sort=id&dir=desc",
    "/project/WEB/list?sort=status&dir=asc",
    "/project/WEB/list?sort=updated&dir=desc",
  ]);
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
  let sendRest: (rest: IssueListPage) => void = () => {};
  const moreIssues = vi.fn<MoreIssues>(
    () =>
      new Promise((resolve) => {
        sendRest = resolve;
      }),
  );
  renderList({ at: "status=backlog", list: () => page(issues.slice(0, 100), { hasMore: true }), moreIssues });

  expect(rowIds()).toHaveLength(100);
  act(() =>
    observers.at(-1)?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
  );
  expect(await screen.findByText("Loading more…")).toBeTruthy();
  expect(moreIssues.mock.calls).toEqual([[{ key: "WEB", query: "status=backlog", offset: 100 }]]);

  await act(async () => sendRest(page(issues.slice(100))));
  await waitFor(() => expect(rowIds()).toHaveLength(120));
  expect(rowIds().at(-1)).toBe("WEB-1");
  expect(screen.queryByText("Loading more…")).toBeNull();
});

it("REQ-037.2, REQ-037.5, REQ-037.6: the Assignee filter offers Unassigned, active members and Jo Park (deactivated), and sends every chosen member", async () => {
  renderList();

  const listbox = await openFilter("Assignee");
  expect(keysOf(listbox)).toEqual(["-", "alex", "sam", "jo"]);
  for (const name of ["Unassigned", "Alex Kim", "Sam Lee", "Jo Park (deactivated)"]) {
    expect(within(listbox).getByRole("option", { name })).toBeTruthy();
  }
  expect(within(listbox).queryByRole("option", { name: /Kim Wu/ })).toBeNull();
  fireEvent.click(within(listbox).getByRole("option", { name: "Unassigned" }));
  fireEvent.click(within(listbox).getByRole("option", { name: "Jo Park (deactivated)" }));
  await waitFor(() =>
    expect(ruleText("Assignee")).toBe("Assigneeis any ofUnassigned, Jo Park (deactivated)×"),
  );
  fireEvent.click(within(listbox).getByRole("option", { name: "Alex Kim" }));
  expect(addresses(router.push)).toEqual([
    "/project/WEB/list?assignee=-",
    "/project/WEB/list?assignee=-&assignee=jo",
    "/project/WEB/list?assignee=-&assignee=jo&assignee=alex",
  ]);
});

it("List — empty project: “Create one.” opens New issue", () => {
  renderList({ list: () => page([]) });

  expect(screen.getByText(/No issues yet\./)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Create one." }));
  expect(screen.getByRole("dialog", { name: "New issue" })).toBeTruthy();
});

it("REQ-036.3: an archived project's list has no New issue, but filters and sort still work", async () => {
  const { createIssue } = renderList({ shown: archivedWeb, list: () => page([]) });

  expect(screen.getByText("No issues.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Create one." })).toBeNull();
  const listbox = await openFilter("Priority");
  fireEvent.click(within(listbox).getByRole("option", { name: "Urgent" }));
  await closeFilter();
  sortBy("Status");
  expect(addresses(router.push).at(-1)).toBe("/project/WEB/list?priority=urgent&sort=status&dir=asc");
  expect(createIssue).not.toHaveBeenCalled();
});