import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ErrorReporterContext } from "./error-reporter";
import { Zone, type ZoneState, zoneState } from "./Zone";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("STD-11.1, STD-11.4: zoneState is loading with no data, failed with no data and an error, and ready whenever data is there", () => {
  expect(zoneState({ data: undefined, isError: false })).toEqual({ status: "loading" });
  expect(zoneState({ data: undefined, isError: true })).toEqual({ status: "failed" });
  expect(zoneState({ data: ["card"], isError: false })).toEqual({ status: "ready", data: ["card"] });
  expect(zoneState({ data: ["card"], isError: true })).toEqual({ status: "ready", data: ["card"] });
});

function renderZone(state: ZoneState<string>, children: (data: string) => React.ReactNode = (data) => data) {
  const report = vi.fn();
  const retry = vi.fn();
  const view = render(
    <ErrorReporterContext value={report}>
      <Zone
        what="comments"
        state={state}
        retry={retry}>
        {children}
      </Zone>
    </ErrorReporterContext>,
  );
  return { report, retry, view };
}

it("STD-7: a loading zone shows Loading… only after 300 ms", () => {
  vi.useFakeTimers();
  renderZone({ status: "loading" });

  expect(screen.queryByText("Loading…")).toBeNull();
  act(() => vi.advanceTimersByTime(300));
  expect(screen.getByText("Loading…")).toBeTruthy();
});

it("STD-11.1, STD-11.2: a failed zone names its region, and Try again loads it again", () => {
  const { retry, view } = renderZone({ status: "failed" });

  expect(screen.getByText("Couldn’t load comments.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledTimes(1);

  view.rerender(
    <Zone
      what="comments"
      state={{ status: "ready", data: "First comment" }}
      retry={retry}>
      {(data) => data}
    </Zone>,
  );
  expect(screen.getByText("First comment")).toBeTruthy();
});

function CommentBody({ text }: { text: string }): React.ReactNode {
  if (text === "bad") throw new Error("Cannot read properties of undefined");
  return text;
}

it("STD-11.3: a crash inside the zone shows only its failed view and reports zone-crashed once, naming the component", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { report, retry, view } = renderZone({ status: "ready", data: "bad" }, (data) => (
    <CommentBody text={data} />
  ));

  expect(screen.getByText("Couldn’t load comments.")).toBeTruthy();
  expect(report).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith("zone-crashed", expect.any(Error), { component: "CommentBody" });

  view.rerender(
    <ErrorReporterContext value={report}>
      <Zone
        what="comments"
        state={{ status: "ready", data: "fixed" }}
        retry={retry}>
        {(data) => <CommentBody text={data} />}
      </Zone>
    </ErrorReporterContext>,
  );
  expect(screen.getByText("fixed")).toBeTruthy();
});