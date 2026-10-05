import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Menu, MenuItem, PopItem } from "./Pop";

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

it("Menu with a text trigger shows the text and checks the selected item", async () => {
  const onAction = vi.fn();
  render(
    <Menu
      label="Change color of frontend"
      text="Change color"
      selectedKey="green"
      onAction={onAction}>
      <MenuItem id="gray">Gray</MenuItem>
      <MenuItem id="green">Green</MenuItem>
      <MenuItem id="blue">Blue</MenuItem>
    </Menu>,
  );
  const trigger = screen.getByRole("button", { name: "Change color of frontend" });
  expect(trigger.textContent).toBe("Change color");

  fireEvent.click(trigger);
  const menu = await screen.findByRole("menu");
  const items = within(menu).getAllByRole("menuitemradio");
  expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
  expect(items[1].textContent).toContain("✓");
  expect(items[0].textContent).not.toContain("✓");

  fireEvent.click(items[2]);
  expect(onAction).toHaveBeenCalledWith("blue");
});