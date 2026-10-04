import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PopItem } from "./Pop";

afterEach(cleanup);

it("marks a selected item with a check", () => {
  render(<PopItem selected>In review</PopItem>);
  const item = screen.getByRole("option", { name: /In review/ });
  expect(item.getAttribute("aria-selected")).toBe("true");
  expect(item.textContent).toContain("✓");
});

it("ignores presses on a disabled item", () => {
  const onClick = vi.fn();
  render(
    <PopItem
      disabled
      onClick={onClick}>
      Archive
    </PopItem>,
  );
  fireEvent.click(screen.getByRole("option"));
  expect(onClick).not.toHaveBeenCalled();
});