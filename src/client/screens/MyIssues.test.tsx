import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { alex, apiError, memberOf, mockApi, renderAppAt, requestsTo, sam } from "../../test/client-app";
import type { IssueLabel, MyIssue, MyIssueGroup } from "../api";
import { formatExact } from "../dates";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const myIssuesPath = "GET /api/my-issues";

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function labels(...names: string[]): IssueLabel[] {
  return names.map((name) => ({ id: `l-${name}`, name, color: "gray" }));
}

function mine(id: string, title: string, overrides: Partial<MyIssue> = {}): MyIssue {
  return {
    id,
    title,
    projectName: id.startsWith("API") ? "API" : "Website",
    priority: "medium",
    assignees: [memberOf(sam)],
    labels: [],
    updatedAt: minutesAgo(5),
    ...overrides,
  };
}

function group(status: MyIssueGroup["status"], issues: MyIssue[]): MyIssueGroup {
  return { status, count: issues.length, issues };
}

function mockMyIssues(answer: () => MyIssueGroup[] | Response | Promise<Response>) {
  return mockApi({
    "GET /api/me": () => Response.json(sam),
    [myIssuesPath]: async () => {
      const result = await answer();
      return result instanceof Response ? result : Response.json(result);
    },
  });
}

function groups() {
  return screen.queryAllByRole("region").map((region) => region.getAttribute("aria-label"));
}

function rowIds(region: HTMLElement) {
  return Array.from(region.querySelectorAll(".tl-list-row__id")).map((id) => id.textContent);
}

const updatedAt = minutesAgo(5);

const defaultGroups = [
  group("backlog", [mine("API-7", "Return 404 for deleted projects")]),
  group("in_progress", [
    mine("WEB-42", "Fix login button", {
      priority: "high",
      assignees: [memberOf(alex), memberOf(sam)],
      labels: labels("bug", "frontend", "Safari"),
      updatedAt,
    }),
    mine("WEB-3", "Redirect old blog URLs", { priority: "none" }),
  ]),
];

it("REQ-041.1, REQ-041.7, REQ-042, REQ-042.2: groups in status order with no empty groups and a total; a row shows its cells; clicking opens the issue", async () => {
  mockMyIssues(() => defaultGroups);
  renderAppAt("/my-issues");

  await waitFor(() => expect(groups()).toEqual(["Backlog, 1 issue", "In Progress, 2 issues"]));
  const total = screen.getByText("3 issues").parentElement as HTMLElement;
  expect(within(total).getByText("3").getAttribute("aria-hidden")).toBe("true");
  const [backlog, inProgress] = screen.getAllByRole("region");
  expect(within(backlog).getByRole("button", { name: "Backlog 1" })).toBeTruthy();
  expect(rowIds(backlog)).toEqual(["API-7"]);
  expect(within(inProgress).getByRole("button", { name: "In Progress 2" })).toBeTruthy();
  expect(rowIds(inProgress)).toEqual(["WEB-42", "WEB-3"]);
  expect(screen.queryByText("In Review")).toBeNull();
  expect(screen.getByText("Sorted by priority, then most recently updated.")).toBeTruthy();

  const link = screen.getByRole("link", {
    name: `WEB-42, Fix login button, High, Website, assigned to Alex Kim, Sam Lee, updated ${formatExact(updatedAt)}`,
  });
  expect(link.getAttribute("href")).toBe("/issue/WEB-42");
  const row = within(link);
  expect(row.getByText("Fix login button").getAttribute("title")).toBe("Fix login button");
  expect(row.getByText("Website").getAttribute("title")).toBe("Website");
  expect(row.getByTitle("High")).toBeTruthy();
  expect(row.getByTitle("Alex Kim, Sam Lee").textContent).toBe("AKSL");
  expect(row.getByText("SL").className).toBe("tl-avatar tl-avatar--md tl-avatar--accent");
  expect(row.getByText("bug")).toBeTruthy();
  expect(row.getByText("frontend")).toBeTruthy();
  expect(row.queryByText("Safari")).toBeNull();
  expect(row.getByText("+1").getAttribute("title")).toBe("Safari");
  expect(row.getByText("5 min ago").getAttribute("title")).toBe(`Updated ${formatExact(updatedAt)}`);
  const unprioritized = screen.getByRole("link", { name: /^WEB-3, / });
  expect(within(unprioritized).queryByRole("img")).toBeNull();

  fireEvent.click(link);
  await waitFor(() => expect(window.location.pathname).toBe("/issue/WEB-42"));
});

it("My issues: Done and Canceled start collapsed and expand from their group head", async () => {
  mockMyIssues(() => [
    group("in_progress", [mine("WEB-42", "Fix login button")]),
    group("done", [mine("WEB-7", "Ship the footer")]),
    group("canceled", [mine("WEB-8", "Drop the blog")]),
  ]);
  renderAppAt("/my-issues");

  const done = await screen.findByRole("button", { name: "Done 1" });
  const canceled = screen.getByRole("button", { name: "Canceled 1" });
  expect(screen.getByRole("button", { name: "In Progress 1" }).getAttribute("aria-expanded")).toBe("true");
  expect(done.getAttribute("aria-expanded")).toBe("false");
  expect(canceled.getAttribute("aria-expanded")).toBe("false");
  expect(screen.getByText("3 issues")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /^WEB-7, / })).toBeNull();

  fireEvent.click(done);
  expect(screen.getByRole("link", { name: /^WEB-7, / })).toBeTruthy();
  expect(screen.queryByRole("link", { name: /^WEB-8, / })).toBeNull();
});

it('REQ-041.4: nothing assigned → "Nothing assigned to you. Open a project to find or create issues."', async () => {
  mockMyIssues(() => []);
  renderAppAt("/my-issues");

  expect(
    await screen.findByText("Nothing assigned to you. Open a project to find or create issues."),
  ).toBeTruthy();
  expect(groups()).toEqual([]);
});

it('STD-7: a load failure shows "Couldn’t load this." and Retry loads again', async () => {
  const answers: (() => MyIssueGroup[] | Response)[] = [
    () => apiError(500, "Server error"),
    () => defaultGroups,
  ];
  const fetchMock = mockMyIssues(() => (answers.shift() ?? (() => defaultGroups))());
  renderAppAt("/my-issues");

  expect(await screen.findByText("Couldn’t load this.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(groups()).toEqual(["Backlog, 1 issue", "In Progress, 2 issues"]));
  expect(requestsTo(fetchMock, myIssuesPath)).toHaveLength(2);
});