import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ErrorReporting } from "./ErrorReporting";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 204 })),
  );
  window.history.replaceState(null, "", "/my-issues");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("OPS-008.1: an uncaught error or unhandled rejection on the page is reported as uncaught", () => {
  render(<ErrorReporting>page</ErrorReporting>);

  window.dispatchEvent(new ErrorEvent("error", { error: new Error("boom"), message: "boom" }));
  window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "nope" }));

  const reports = vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(init?.body as string));
  expect(reports).toMatchObject([
    { event: "uncaught", message: "boom", page: "/my-issues" },
    { event: "uncaught", message: "nope", page: "/my-issues" },
  ]);
});