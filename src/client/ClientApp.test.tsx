import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ClientApp from "./ClientApp";

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

async function notFoundLink() {
  const links = await screen.findAllByRole("link", { name: "My issues" });
  const sidebar = screen.getByRole("complementary");
  return links.find((link) => !sidebar.contains(link)) as HTMLElement;
}

function renderAt(path: string) {
  window.history.replaceState(null, "", path);
  return render(<ClientApp />);
}

it("M0.4: any page address loads the app shell", async () => {
  for (const path of ["/my-issues", "/project/WEB/list"]) {
    renderAt(path);
    const sidebar = await screen.findByRole("complementary");
    expect(sidebar.textContent).toContain("Tracklite");
    cleanup();
  }
});

it("STD-4: an unknown address shows Not found with a link to My issues", async () => {
  renderAt("/nope");
  expect(await screen.findByRole("heading", { name: "Not found" })).toBeTruthy();
  expect((await notFoundLink()).getAttribute("href")).toBe("/my-issues");
});

it("M0.4: moving between two routes doesn't reload the document", async () => {
  renderAt("/nope");
  await screen.findByRole("heading", { name: "Not found" });
  const link = await notFoundLink();
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

it("STD-1: with no session the shell lands on sign-in", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: { message: "Sign in to continue." } }, { status: 401 })),
  );

  renderAt("/my-issues");

  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
  expect(window.location.pathname).toBe("/sign-in");
  expect(window.location.search).toBe(`?next=${encodeURIComponent("/my-issues")}`);
  expect(screen.queryByRole("heading", { name: "My issues" })).toBeNull();
});