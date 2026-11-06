import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { NotificationStats, ProblemDelivery } from "../../../../contract";
import { NotificationStatusBar, StatsReport } from "./NotificationStatus";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  router.refresh.mockClear();
});

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
    outboxLastRunAt: secondsAgo(4),
    outboxStaleMinutes: null,
    queue: { pending: 3, due: 1, oldestDueSeconds: 40 },
    channels: [{ channel: "email", sent: 12, dropped: 2, failed: 1, bounced: 1 }],
    recentProblems: [problem()],
    ...overrides,
  };
}

function section(name: string) {
  return screen.getByRole("region", { name });
}

function fact(region: HTMLElement, label: string) {
  return within(region).getByText(label).nextElementSibling?.textContent;
}

function bodyRows(name: string) {
  return within(screen.getByRole("table", { name })).getAllByRole("row").slice(1);
}

function cellTexts(row: HTMLElement) {
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);
}

function workerWarning(worker: HTMLElement) {
  return within(worker).queryByText(/never run|No outbox run/)?.textContent;
}

it("REQ-053.1, REQ-053.2, REQ-053.3, REQ-053.4, REQ-053.10: worker without a warning, queue, Email counts, problem rows newest first", () => {
  const older = Array.from({ length: 19 }, (_, index) =>
    problem({ id: `d-${index + 2}`, target: `WEB-${index + 1}`, at: secondsAgo((index + 4) * 3600) }),
  );
  const recentProblems = [problem(), ...older];
  render(<StatsReport stats={stats({ recentProblems })} />);

  const worker = section("Worker");
  expect(fact(worker, "Last seen")).toBe("just now");
  expect(workerWarning(worker)).toBeUndefined();
  const queue = section("Queue");
  expect(fact(queue, "Pending")).toBe("3");
  expect(fact(queue, "Due")).toBe("1");
  expect(fact(queue, "Oldest due has waited")).toBe("40 seconds");

  const [email] = bodyRows("Last 24 hours");
  expect(within(email).getByRole("rowheader").textContent).toBe("Email");
  expect(cellTexts(email)).toEqual(["12", "2", "1", "1"]);

  const rows = bodyRows("Recent problems");
  expect(rows).toHaveLength(20);
  expect(rows.map((row) => cellTexts(row)[2])).toEqual(recentProblems.map((each) => each.target));
  expect(cellTexts(rows[0])).toEqual(["sam", "Email", "WEB-42", "4", "3 hours ago"]);
  expect(within(rows[0]).getByText("3 hours ago").getAttribute("title")).toBeTruthy();
  expect(document.body.textContent).not.toContain("sam@acme.com");
});

it("REQ-053.5, REQ-053.6, REQ-053.9: a worker that never ran shows Never with its warning, nothing due shows None, no problems shows the empty message", () => {
  render(
    <StatsReport
      stats={stats({
        outboxLastRunAt: null,
        queue: { pending: 2, due: 0, oldestDueSeconds: 0 },
        recentProblems: [],
      })}
    />,
  );

  const worker = section("Worker");
  expect(fact(worker, "Last seen")).toBe("Never");
  expect(workerWarning(worker)).toBe("The outbox has never run. No notifications are sent until it does.");

  const queue = section("Queue");
  expect(fact(queue, "Pending")).toBe("2");
  expect(fact(queue, "Due")).toBe("0");
  expect(fact(queue, "Oldest due has waited")).toBe("None");

  const recent = section("Recent problems");
  expect(within(recent).getByText("No failed or bounced notifications.")).toBeTruthy();
  expect(within(recent).queryByRole("table")).toBeNull();
});

it("REQ-053.10: no pass for 3 minutes warns with the whole minutes", () => {
  render(<StatsReport stats={stats({ outboxLastRunAt: secondsAgo(200), outboxStaleMinutes: 3 })} />);

  expect(workerWarning(section("Worker"))).toBe(
    "No outbox run for 3 min. Notifications wait in the queue until it runs.",
  );
});

it("REQ-053.7: numbers change only on Refresh, which refreshes the page from the server", () => {
  render(<NotificationStatusBar />);

  window.dispatchEvent(new Event("focus"));
  window.dispatchEvent(new Event("online"));
  document.dispatchEvent(new Event("visibilitychange"));
  expect(router.refresh).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

  expect(router.refresh).toHaveBeenCalledOnce();
});