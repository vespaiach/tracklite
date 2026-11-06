import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ClientApp from "./ClientApp";

vi.mock("./screens/ProjectDetail", () => ({
  ProjectDetail: () => {
    throw new Error("render failed");
  },
}));

const sam = {
  username: "sam",
  fullName: "Sam Lee",
  initials: "SL",
  deactivated: false,
  email: "sam@acme.com",
  role: "member",
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(sam)),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  window.history.replaceState(null, "", path);
  return render(<ClientApp createIssue={vi.fn()} />);
}

it("M0.4, STD-4: an unknown address shows Not found, with a “Go to My issues” link that loads /my-issues", async () => {
  renderAt("/nope");
  expect(await screen.findByRole("heading", { name: "Not found" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Go to My issues" }).getAttribute("href")).toBe("/my-issues");
});

it("OPS-008.1: an uncaught error or unhandled rejection on the page is reported as uncaught", async () => {
  renderAt("/nope");
  await screen.findByRole("heading", { name: "Not found" });

  window.dispatchEvent(new ErrorEvent("error", { error: new Error("boom"), message: "boom" }));
  window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "nope" }));

  const reports = vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => init?.method === "POST")
    .map(([, init]) => JSON.parse(init?.body as string));
  expect(reports).toMatchObject([
    { event: "uncaught", message: "boom", page: "/nope" },
    { event: "uncaught", message: "nope", page: "/nope" },
  ]);
});

it("STD-10.1: a page that crashes while rendering shows the crash screen and reports page-crashed", async () => {
  renderAt("/project/WEB/detail");

  expect(await screen.findByRole("heading", { name: "Something went wrong" })).toBeTruthy();
  const reports = vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => init?.method === "POST")
    .map(([, init]) => JSON.parse(init?.body as string));
  expect(reports).toMatchObject([
    { event: "page-crashed", message: "render failed", page: "/project/WEB/detail" },
  ]);
});