import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { apiError, mockApi, renderAppAt, requestsTo, sam } from "../../test/client-app";
import type { IssueLabel, MyIssue, MyIssueGroup } from "../api";

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
  return within(region)
    .getAllByRole("row")
    .map((row) => row.querySelector(".tl-list-row__id")?.textContent);
}

const updatedAt = minutesAgo(5);

const defaultGroups = [
  group("backlog", [mine("API-7", "Return 404 for deleted projects")]),
  group("in_progress", [
    mine("WEB-42", "Fix login button", {
      priority: "high",
      labels: labels("bug", "frontend", "Safari"),
      updatedAt,
    }),
    mine("WEB-3", "Redirect old blog URLs", { priority: "none" }),
  ]),
];

it("REQ-041.1, REQ-042, REQ-042.2: groups in status order with no empty groups; a row shows its cells; clicking opens the issue", async () => {
  mockMyIssues(() => defaultGroups);
  renderAppAt("/my-issues");

  await waitFor(() => expect(groups()).toEqual(["Backlog, 1 issue", "In Progress, 2 issues"]));
  const [backlog, inProgress] = screen.getAllByRole("region");
  expect(within(backlog).getByText("Backlog")).toBeTruthy();
  expect(within(backlog).getByText("1")).toBeTruthy();
  expect(rowIds(backlog)).toEqual(["API-7"]);
  expect(within(inProgress).getByText("2")).toBeTruthy();
  expect(rowIds(inProgress)).toEqual(["WEB-42", "WEB-3"]);
  expect(screen.queryByText("In Review")).toBeNull();
  expect(screen.queryByText("Done")).toBeNull();
  expect(screen.queryByText("Canceled")).toBeNull();

  const link = screen.getByRole("link", { name: "Fix login button" });
  expect(link.getAttribute("href")).toBe("/issue/WEB-42");
  const [first, second] = within(inProgress).getAllByRole("row");
  const row = within(first);
  expect(row.getByText("WEB-42")).toBeTruthy();
  expect(row.getByText("Website")).toBeTruthy();
  expect(row.getByTitle("High")).toBeTruthy();
  expect(row.getByText("bug")).toBeTruthy();
  expect(row.getByText("frontend")).toBeTruthy();
  expect(row.queryByText("Safari")).toBeNull();
  expect(row.getByText("+1").getAttribute("title")).toBe("Safari");
  const updated = row.getByText("5 min ago");
  expect(updated.getAttribute("title")).toBe(new Date(updatedAt).toLocaleString());
  expect(within(second).queryByRole("img")).toBeNull();

  fireEvent.click(link);
  await waitFor(() => expect(window.location.pathname).toBe("/issue/WEB-42"));
});

it('REQ-041.4: nothing assigned → "Nothing assigned to you"', async () => {
  mockMyIssues(() => []);
  renderAppAt("/my-issues");

  expect(await screen.findByText("Nothing assigned to you")).toBeTruthy();
  expect(groups()).toEqual([]);
});

it('STD-7: a load failure shows "Couldn\'t load this." and Retry loads again', async () => {
  const answers: (() => MyIssueGroup[] | Response)[] = [
    () => apiError(500, "Server error"),
    () => defaultGroups,
  ];
  const fetchMock = mockMyIssues(() => (answers.shift() ?? (() => defaultGroups))());
  renderAppAt("/my-issues");

  expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(groups()).toEqual(["Backlog, 1 issue", "In Progress, 2 issues"]));
  expect(requestsTo(fetchMock, myIssuesPath)).toHaveLength(2);
});