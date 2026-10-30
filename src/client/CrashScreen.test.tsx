import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CrashScreen } from "./CrashScreen";

const minute = 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderCrash(error: unknown = new Error("boom")) {
  const report = vi.fn();
  const reload = vi.fn();
  const view = render(
    <CrashScreen
      error={error}
      report={report}
      reload={reload}
    />,
  );
  return { report, reload, view };
}

it("STD-10.1: the crash screen shows its copy and reports page-crashed once, however long it stays", () => {
  const error = new Error("boom");
  const { report, view } = renderCrash(error);

  expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeTruthy();
  expect(screen.getByText("Reloading in 60 s.")).toBeTruthy();
  act(() => vi.advanceTimersByTime(30 * 1000));
  view.rerender(
    <CrashScreen
      error={error}
      report={report}
      reload={() => {}}
    />,
  );

  expect(screen.getByText("Reloading in 30 s.")).toBeTruthy();
  expect(report).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith("page-crashed", error, { digest: undefined });
});

it("STD-10.5: the report carries the server's error reference", () => {
  const error = Object.assign(new Error("An error occurred in the Server Components render."), {
    digest: "1234567890",
  });

  const { report } = renderCrash(error);

  expect(report).toHaveBeenCalledWith("page-crashed", error, { digest: "1234567890" });
});

it("STD-10.2: the page reloads when the countdown reaches 0", () => {
  const { reload } = renderCrash();

  act(() => vi.advanceTimersByTime(59 * 1000));
  expect(reload).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1000));

  expect(reload).toHaveBeenCalledTimes(1);
});

it("STD-10.3: Reload reloads the page at once", () => {
  const { reload } = renderCrash();

  fireEvent.click(screen.getByRole("button", { name: "Reload" }));

  expect(reload).toHaveBeenCalledTimes(1);
});

it("STD-10.4: the 3rd crash in the tab within 10 minutes shows no countdown and reloads only on Reload", () => {
  renderCrash();
  cleanup();
  vi.setSystemTime(Date.now() + 11 * minute);
  renderCrash();
  cleanup();
  vi.setSystemTime(Date.now() + 5 * minute);
  renderCrash();
  expect(screen.getByText("Reloading in 60 s.")).toBeTruthy();
  cleanup();

  vi.setSystemTime(Date.now() + 4 * minute);
  const { reload } = renderCrash();
  act(() => vi.advanceTimersByTime(2 * minute));

  expect(screen.getByText("Reload to try again.")).toBeTruthy();
  expect(screen.queryByText(/Reloading in/)).toBeNull();
  expect(reload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Reload" }));
  expect(reload).toHaveBeenCalledTimes(1);
});