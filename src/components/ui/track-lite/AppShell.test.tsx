import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RailItem, RailLabelAction } from "./AppShell";

afterEach(cleanup);

it("renders a rail item with an href as a link marked as the current page", () => {
  render(
    <RailItem
      href="/project/WEB/board"
      icon={null}
      label="Website"
      current
    />,
  );
  const link = screen.getByRole("link", { name: "Website" });
  expect(link.getAttribute("href")).toBe("/project/WEB/board");
  expect(link.getAttribute("aria-current")).toBe("page");
});

it("shows a rail item's name and suffix apart, titled with both unless the title is cleared", () => {
  const { rerender } = render(
    <RailItem
      href="/project/WEB/board"
      icon={null}
      label="Website"
      suffix=" · WEB"
    />,
  );
  const link = screen.getByRole("link");
  expect(screen.getByText("Website")).toBeTruthy();
  expect(screen.getByText("· WEB", { normalizer: (text) => text.trim() })).toBeTruthy();
  expect(link.getAttribute("title")).toBe("Website · WEB");

  rerender(
    <RailItem
      href="/project/WEB/board"
      icon={null}
      label="Website"
      suffix=" · WEB"
      title=""
    />,
  );
  expect(screen.getByRole("link").hasAttribute("title")).toBe(false);
});

it("names a rail label action by its label and reports presses", () => {
  const onClick = vi.fn();
  render(
    <RailLabelAction
      label="New project"
      onClick={onClick}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "New project" }));
  expect(onClick).toHaveBeenCalledOnce();
});