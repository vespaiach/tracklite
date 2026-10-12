import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { admin, alex, apiError, mockApi, renderAppAt, requestsTo } from "../../test/client-app";
import type { NotificationStats, ProblemDelivery } from "../api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Answer = () => Response | Promise<Response>;

const statsRequest = "GET /api/notification-stats";

function secondsAgo(seconds: number) {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

function problem(overrides: Partial<ProblemDelivery> = {}): ProblemDelivery {
  return {
    id: "d-1",
    username: "sam",
    channel: "email",
    target: "WEB-42",
    state: "failed",
    attempts: 4,
    at: secondsAgo(3 * 3600),
    ...overrides,
  };
}

function stats(overrides: Partial<NotificationStats> = {}): NotificationStats {
  return {
    workerLastPassAt: secondsAgo(4),
    queue: { pending: 3, due: 1, oldestDueSeconds: 40 },
    channels: [{ channel: "email", sent: 12, dropped: 2, failed: 1, bounced: 1 }],
    recentProblems: [problem()],
    ...overrides,
  };
}

function mockStatusPage(answer: Answer, me = admin) {
  return mockApi({
    "GET /api/me": () => Response.json(me),
    [statsRequest]: answer,
  });
}

function section(name: string) {
  return screen.findByRole("region", { name });
}

function fact(region: HTMLElement, label: string) {
  return within(region).getByText(label).nextElementSibling?.textContent;
}

async function bodyRows(name: string) {
  const table = await screen.findByRole("table", { name });
  return within(table).getAllByRole("row").slice(1);
}

function cellTexts(row: HTMLElement) {
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);
}

it("REQ-053.1: worker seen 4 s ago, 3 pending, 1 due for 40 s", async () => {
  mockStatusPage(() => Response.json(stats()));
  renderAppAt("/settings/notifications");

  expect(fact(await section("Worker"), "Last seen")).toBe("just now");
  const queue = await section("Queue");
  expect(fact(queue, "Pending")).toBe("3");
  expect(fact(queue, "Due")).toBe("1");
  expect(fact(queue, "Oldest due has waited")).toBe("40 seconds");
});

it("REQ-053.2: Email row shows 12 sent, 2 dropped, 1 failed, 1 bounced", async () => {
  mockStatusPage(() => Response.json(stats()));
  renderAppAt("/settings/notifications");

  const [email] = await bodyRows("Last 24 hours");
  expect(cellTexts(email)).toEqual(["Email", "12", "2", "1", "1"]);
});

it("REQ-053.3: failed row shows sam, Email, WEB-42, 4 and when", async () => {
  const failed = problem();
  mockStatusPage(() => Response.json(stats({ recentProblems: [failed] })));
  renderAppAt("/settings/notifications");

  const [row] = await bodyRows("Recent problems");
  expect(cellTexts(row)).toEqual(["sam", "Email", "WEB-42", "4", "3 hours ago"]);
  expect(within(row).getByText("3 hours ago").getAttribute("title")).toBeTruthy();
  expect(document.body.textContent).not.toContain("sam@acme.com");
});

it("REQ-053.4: 20 most recent problems listed newest first", async () => {
  const recentProblems = Array.from({ length: 20 }, (_, index) =>
    problem({ id: `d-${index}`, target: `WEB-${index + 1}`, at: secondsAgo((index + 1) * 3600) }),
  );
  mockStatusPage(() => Response.json(stats({ recentProblems })));
  renderAppAt("/settings/notifications");

  const rows = await bodyRows("Recent problems");
  expect(rows).toHaveLength(20);
  expect(rows.map((row) => cellTexts(row)[2])).toEqual(recentProblems.map((each) => each.target));
});

it("REQ-053.5: worker that never ran shows “Never”", async () => {
  mockStatusPage(() => Response.json(stats({ workerLastPassAt: null })));
  renderAppAt("/settings/notifications");

  expect(fact(await section("Worker"), "Last seen")).toBe("Never");
});

it("REQ-053.6: no problems shows “No failed or bounced notifications.”", async () => {
  mockStatusPage(() => Response.json(stats({ recentProblems: [] })));
  renderAppAt("/settings/notifications");

  const recent = await section("Recent problems");
  expect(within(recent).getByText("No failed or bounced notifications.")).toBeTruthy();
  expect(within(recent).queryByRole("table")).toBeNull();
});

it("REQ-053.7: numbers change only on Refresh", async () => {
  let sent = 12;
  let release = () => {};
  let hold = false;
  const fetchMock = mockStatusPage(async () => {
    if (hold) await new Promise<void>((resolve) => (release = resolve));
    return Response.json(
      stats({ channels: [{ channel: "email", sent, dropped: 2, failed: 1, bounced: 1 }] }),
    );
  });
  renderAppAt("/settings/notifications");
  await bodyRows("Last 24 hours");

  sent = 13;
  window.dispatchEvent(new Event("focus"));
  window.dispatchEvent(new Event("online"));
  document.dispatchEvent(new Event("visibilitychange"));
  expect(requestsTo(fetchMock, statsRequest)).toHaveLength(1);
  expect(cellTexts((await bodyRows("Last 24 hours"))[0])[1]).toBe("12");

  hold = true;
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  const refreshing = await screen.findByRole("button", { name: "Refreshing…" });
  expect((refreshing as HTMLButtonElement).disabled).toBe(true);
  expect(cellTexts((await bodyRows("Last 24 hours"))[0])[1]).toBe("12");

  release();
  await waitFor(async () => expect(cellTexts((await bodyRows("Last 24 hours"))[0])[1]).toBe("13"));
  expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
});

it("REQ-053.8: a member sees “You don't have permission to do that.” and no Notifications link", async () => {
  const fetchMock = mockStatusPage(() => Response.json(stats()), alex);
  renderAppAt("/settings/notifications");

  expect(await screen.findByText("You don't have permission to do that.")).toBeTruthy();
  expect(within(screen.getByRole("complementary")).queryByRole("link", { name: "Notifications" })).toBeNull();
  expect(requestsTo(fetchMock, statsRequest)).toHaveLength(0);
});

it("REQ-053.9: nothing due shows “None” for the oldest due", async () => {
  mockStatusPage(() => Response.json(stats({ queue: { pending: 2, due: 0, oldestDueSeconds: 0 } })));
  renderAppAt("/settings/notifications");

  const queue = await section("Queue");
  expect(fact(queue, "Pending")).toBe("2");
  expect(fact(queue, "Due")).toBe("0");
  expect(fact(queue, "Oldest due has waited")).toBe("None");
});

it("STD-2: admins get the Notifications link, current on its page", async () => {
  mockStatusPage(() => Response.json(stats()));
  renderAppAt("/settings/notifications");

  const link = await within(await screen.findByRole("complementary")).findByRole("link", {
    name: "Notifications",
  });
  expect(link.getAttribute("href")).toBe("/settings/notifications");
  expect(link.getAttribute("aria-current")).toBe("page");
});

it("STD-7: a load failure shows “Couldn't load this.” with Retry", async () => {
  let fail = true;
  mockStatusPage(() => (fail ? apiError(500, "Internal error") : Response.json(stats())));
  renderAppAt("/settings/notifications");

  expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));

  expect(await section("Worker")).toBeTruthy();
});