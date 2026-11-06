import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { notFound } from "next/navigation";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ErrorReporterContext } from "../../client/error-reporter";
import { Region } from "./Region";

let failure: Error | undefined;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  failure = undefined;
});

function CommentList(): ReactNode {
  if (failure) throw failure;
  return "First comment";
}

class ParentBoundary extends Component<{ children: ReactNode }, { caught: boolean }> {
  state = { caught: false };

  static getDerivedStateFromError() {
    return { caught: true };
  }

  render() {
    return this.state.caught ? "Not found page" : this.props.children;
  }
}

function renderRegion(children: ReactNode = <CommentList />) {
  const report = vi.fn();
  const refresh = vi.fn();
  render(
    <AppRouterContext value={{ refresh } as unknown as AppRouterInstance}>
      <ErrorReporterContext value={report}>
        <ParentBoundary>
          <Region what="comments">{children}</Region>
        </ParentBoundary>
      </ErrorReporterContext>
    </AppRouterContext>,
  );
  return { report, refresh };
}

it("STD-11.1, STD-11.2: a region whose data fails shows its failed view, and Try again re-fetches the page's data and shows it", () => {
  failure = Object.assign(new Error("database is down"), { digest: "123" });
  const { report, refresh } = renderRegion();

  expect(screen.getByText("Couldn’t load comments.")).toBeTruthy();
  expect(report).not.toHaveBeenCalled();

  failure = undefined;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.getByText("First comment")).toBeTruthy();
});

it("STD-11.3: a crash inside the region shows only its failed view and reports zone-crashed once, naming the component", () => {
  failure = new Error("Cannot read properties of undefined");
  const { report } = renderRegion();

  expect(screen.getByText("Couldn’t load comments.")).toBeTruthy();
  expect(report).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith("zone-crashed", failure, { component: "CommentList" });
});

function MissingIssue(): ReactNode {
  notFound();
}

it("STD-11: notFound() inside a region passes through to the boundary above it, unreported", () => {
  const { report } = renderRegion(<MissingIssue />);

  expect(screen.getByText("Not found page")).toBeTruthy();
  expect(screen.queryByText("Couldn’t load comments.")).toBeNull();
  expect(report).not.toHaveBeenCalled();
});