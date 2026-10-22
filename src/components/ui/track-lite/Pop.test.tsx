import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Menu, MenuItem } from "./Pop";

afterEach(cleanup);

it("Menu: a text trigger shows its text and checks the selected item; Escape closes it and returns focus to the trigger", async () => {
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

  fireEvent.click(trigger);
  const reopened = await screen.findByRole("menu");
  await waitFor(() => expect(reopened.contains(document.activeElement)).toBe(true));
  fireEvent.keyDown(document.activeElement ?? reopened, { key: "Escape" });

  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});