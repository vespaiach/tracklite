import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Menu, MenuItem, Picker, PickerItem, PopItem } from "./Pop";

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

function StatusPicker({ onChange = vi.fn() }: { onChange?: (key: unknown) => void }) {
  return (
    <Picker
      label="Status"
      selectedKey="progress"
      value="In Progress"
      onChange={onChange}>
      <PickerItem
        id="backlog"
        textValue="Backlog">
        Backlog
      </PickerItem>
      <PickerItem
        id="progress"
        textValue="In Progress">
        In Progress
      </PickerItem>
      <PickerItem
        id="done"
        textValue="Done">
        Done
      </PickerItem>
    </Picker>
  );
}

it("Picker shows its value on the Pick and opens a listbox with a check on the current item", async () => {
  render(<StatusPicker />);
  const pick = screen.getByRole("button", { name: /Status/ });
  expect(pick.classList.contains("tl-pick")).toBe(true);
  expect(pick.textContent).toContain("In Progress");

  fireEvent.click(pick);
  const options = within(await screen.findByRole("listbox")).getAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual(["Backlog", "In Progress✓", "Done"]);
  expect(options[1].getAttribute("aria-selected")).toBe("true");
});

it("Picker calls onChange with the chosen key", async () => {
  const onChange = vi.fn();
  render(<StatusPicker onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /Status/ }));
  fireEvent.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "Done" }));
  expect(onChange).toHaveBeenCalledWith("done");
});

it("Picker with search filters the items as you type", async () => {
  render(
    <Picker
      label="Assignee"
      selectedKey="none"
      value="Unassigned"
      empty
      onChange={vi.fn()}
      search={{
        label: "Filter members",
        placeholder: "Assign to…",
        filter: (text, input) => text === "Unassigned" || text.toLowerCase().includes(input.toLowerCase()),
      }}>
      <PickerItem
        id="none"
        textValue="Unassigned">
        Unassigned
      </PickerItem>
      <PickerItem
        id="sam"
        textValue="Sam Lee sam">
        Sam Lee
      </PickerItem>
      <PickerItem
        id="priya"
        textValue="Priya Shah priya">
        Priya Shah
      </PickerItem>
    </Picker>,
  );
  const pick = screen.getByRole("button", { name: /Assignee/ });
  expect(pick.classList.contains("tl-pick--empty")).toBe(true);
  fireEvent.click(pick);
  const search = await screen.findByRole("searchbox", { name: "Filter members" });
  expect(search.getAttribute("placeholder")).toBe("Assign to…");

  fireEvent.change(search, { target: { value: "pri" } });
  const names = within(screen.getByRole("listbox"))
    .getAllByRole("option")
    .map((option) => option.textContent?.replace("✓", ""));
  expect(names).toEqual(["Unassigned", "Priya Shah"]);
});