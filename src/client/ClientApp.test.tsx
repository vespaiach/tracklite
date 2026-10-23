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