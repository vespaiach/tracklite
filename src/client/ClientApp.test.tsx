import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ClientApp from "./ClientApp";

vi.mock("./screens/ArchivedProjects", () => ({
  ArchivedProjects: () => {
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
    vi.fn(async (url: string) => (url.startsWith("/api/projects") ? Response.json([]) : Response.json(sam))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  window.history.replaceState(null, "", path);
  return render(<ClientApp />);
}

it("M0.4, STD-4: an unknown address shows Not found; its “Go to My issues” link navigates without a reload", async () => {
  renderAt("/nope");
  expect(await screen.findByRole("heading", { name: "Not found" })).toBeTruthy();
  const link = await screen.findByRole("link", { name: "Go to My issues" });
  expect(link.getAttribute("href")).toBe("/my-issues");
  const sidebar = screen.getByRole("complementary");

  const notCancelled = fireEvent.click(link);

  expect(notCancelled).toBe(false);
  expect(await screen.findByRole("heading", { name: "My issues" })).toBeTruthy();
  expect(window.location.pathname).toBe("/my-issues");
  expect(screen.getByRole("complementary")).toBe(sidebar);
});

it("M0.4: / redirects to /my-issues", async () => {
  renderAt("/");
  expect(await screen.findByRole("heading", { name: "My issues" })).toBeTruthy();
  expect(window.location.pathname).toBe("/my-issues");
});

it("OPS-008.1: an uncaught error or unhandled rejection on the page is reported as uncaught", async () => {
  renderAt("/my-issues");
  await screen.findByRole("heading", { name: "My issues" });

  window.dispatchEvent(new ErrorEvent("error", { error: new Error("boom"), message: "boom" }));
  window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "nope" }));

  const reports = vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => init?.method === "POST")
    .map(([, init]) => JSON.parse(init?.body as string));
  expect(reports).toMatchObject([
    { event: "uncaught", message: "boom", page: "/my-issues" },
    { event: "uncaught", message: "nope", page: "/my-issues" },
  ]);
});

it("STD-10.1: a page that crashes while rendering shows the crash screen and reports page-crashed", async () => {
  renderAt("/projects/archived");

  expect(await screen.findByRole("heading", { name: "Something went wrong" })).toBeTruthy();
  const reports = vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => init?.method === "POST")
    .map(([, init]) => JSON.parse(init?.body as string));
  expect(reports).toMatchObject([{ event: "page-crashed", message: "render failed", page: "/projects/archived" }]);
});