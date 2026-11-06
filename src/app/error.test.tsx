import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ErrorReporting } from "../components/ErrorReporting";
import PageError from "./error";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 204 })),
  );
  sessionStorage.clear();
  window.history.replaceState(null, "", "/issue/WEB-42");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function sentReports() {
  return vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(init?.body as string));
}

it("STD-10.1: a page that crashes shows the crash screen and reports page-crashed once through the layout's reporter", () => {
  const crash = (
    <ErrorReporting>
      <PageError error={new Error("render failed")} />
    </ErrorReporting>
  );
  render(crash).rerender(crash);

  expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeTruthy();
  expect(screen.getByText("Reloading in 60 s.")).toBeTruthy();
  expect(sentReports()).toMatchObject([
    { event: "page-crashed", message: "render failed", page: "/issue/WEB-42" },
  ]);
});