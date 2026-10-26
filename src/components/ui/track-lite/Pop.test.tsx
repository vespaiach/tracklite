import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Menu, MenuItem, MenuSubmenu, MultiPicker, Picker, PickerItem } from "./Pop";

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

it("Picker and MultiPicker: the trigger ends in a hidden caret and the open list shows the empty note", async () => {
  const pickers = [
    {
      name: /^Assignee/,
      note: "No members yet.",
      element: (
        <Picker
          label="Assignee"
          selectedKey="none"
          value="Unassigned"
          emptyNote="No members yet."
          onChange={vi.fn()}>
          <PickerItem
            id="none"
            textValue="Unassigned">
            Unassigned
          </PickerItem>
        </Picker>
      ),
    },
    {
      name: /^Labels/,
      note: "No labels in this project yet.",
      element: (
        <MultiPicker
          label="Labels"
          selectedKeys={[]}
          value="None"
          emptyNote="No labels in this project yet."
          onToggle={vi.fn()}
          search={{ label: "Filter or create labels" }}>
          {[]}
        </MultiPicker>
      ),
    },
  ];
  for (const picker of pickers) {
    render(picker.element);
    const trigger = screen.getByRole("button", { name: picker.name });
    expect(trigger.lastElementChild?.classList.contains("tl-pick__caret")).toBe(true);
    expect(trigger.lastElementChild?.getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(trigger);
    expect(await screen.findByText(picker.note)).toBeTruthy();
    cleanup();
  }
});

it("Menu: the rail variant is a rail item whose menu opens upward", async () => {
  render(
    <Menu
      label="Sam Lee"
      variant="rail"
      text="Sam Lee"
      onAction={vi.fn()}>
      <MenuItem id="profile">Profile</MenuItem>
      <MenuItem id="sign-out">Sign out</MenuItem>
    </Menu>,
  );
  const trigger = screen.getByRole("button", { name: "Sam Lee" });
  expect(trigger.classList.contains("tl-rail-item")).toBe(true);
  trigger.getBoundingClientRect = () => new DOMRect(0, 700, 220, 32);

  fireEvent.click(trigger);
  const menu = await screen.findByRole("menu");
  await waitFor(() => expect(menu.closest("[data-placement]")?.getAttribute("data-placement")).toBe("top"));
});

it("REQ-030.3: on a phone-width screen a submenu opens below its item instead of beside the menu", async () => {
  for (const [width, placement] of [
    [1280, "right"],
    [375, "bottom"],
  ] as const) {
    window.innerWidth = width;
    render(
      <Menu
        label="Actions"
        onAction={vi.fn()}>
        <MenuSubmenu label="Move to">
          <MenuItem id="done">Done</MenuItem>
        </MenuSubmenu>
      </Menu>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    const moveTo = within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Move to" });
    moveTo.focus();
    fireEvent.keyDown(moveTo, { key: "ArrowRight" });
    const submenu = (await screen.findAllByRole("menu"))[1];

    await waitFor(() =>
      expect(submenu.closest("[data-placement]")?.getAttribute("data-placement")).toBe(placement),
    );
    cleanup();
  }
  window.innerWidth = 1024;
});