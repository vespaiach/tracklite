import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import ClientApp from "./ClientApp";

afterEach(cleanup);

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
  expect(screen.getByRole("link", { name: "My issues" }).getAttribute("href")).toBe("/my-issues");
});

it("M0.4: moving between two routes doesn't reload the document", async () => {
  renderAt("/nope");
  const link = await screen.findByRole("link", { name: "My issues" });
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