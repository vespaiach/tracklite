import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MentionList, Menu, MenuItem, MultiPicker, Picker, PickerItem, PopItem } from "./Pop";

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

function LabelPicker({
  onToggle = vi.fn(),
  onCreate = vi.fn(),
}: {
  onToggle?: (key: unknown) => void;
  onCreate?: (input: string) => void;
}) {
  return (
    <MultiPicker
      label="Labels"
      selectedKeys={["bug", "docs"]}
      value="bug docs"
      onToggle={onToggle}
      search={{ label: "Filter or create labels", placeholder: "Filter or create…" }}
      createText={(input) => (input === "Perf" ? "Create label “Perf”" : undefined)}
      onCreate={onCreate}>
      <PickerItem
        id="bug"
        textValue="bug">
        bug
      </PickerItem>
      <PickerItem
        id="docs"
        textValue="docs">
        docs
      </PickerItem>
      <PickerItem
        id="frontend"
        textValue="frontend">
        frontend
      </PickerItem>
    </MultiPicker>
  );
}

it("MultiPicker checks every selected item and reports each toggle without closing", async () => {
  const onToggle = vi.fn();
  render(<LabelPicker onToggle={onToggle} />);
  const pick = screen.getByRole("button", { name: /Labels/ });
  expect(pick.classList.contains("tl-pick")).toBe(true);

  fireEvent.click(pick);
  const listbox = await screen.findByRole("listbox");
  expect(listbox.getAttribute("aria-multiselectable")).toBe("true");
  const options = within(listbox).getAllByRole("option");
  expect(options.map((option) => option.getAttribute("aria-selected"))).toEqual(["true", "true", "false"]);

  fireEvent.click(options[2]);
  expect(onToggle).toHaveBeenLastCalledWith("frontend");
  fireEvent.click(options[0]);
  expect(onToggle).toHaveBeenLastCalledWith("bug");
  expect(screen.getByRole("listbox")).toBeTruthy();
});

it("MultiPicker shows a create row for the typed text and reports the text when chosen", async () => {
  const onCreate = vi.fn();
  render(<LabelPicker onCreate={onCreate} />);
  fireEvent.click(screen.getByRole("button", { name: /Labels/ }));
  const search = await screen.findByRole("searchbox", { name: "Filter or create labels" });
  expect(screen.queryByRole("option", { name: /Create label/ })).toBeNull();

  fireEvent.change(search, { target: { value: "Perf" } });
  fireEvent.click(screen.getByRole("option", { name: "Create label “Perf”" }));
  expect(onCreate).toHaveBeenCalledWith("Perf");
});

const mentionable = [
  { username: "alex", fullName: "Alex Kim", initials: "AK" },
  { username: "sam", fullName: "Sam Lee", initials: "SL" },
];

it("MentionList marks the active member and reports a chosen one", () => {
  const onChoose = vi.fn();
  render(
    <MentionList
      id="sug"
      members={mentionable}
      active={1}
      empty="No results"
      onChoose={onChoose}
    />,
  );
  const options = within(screen.getByRole("listbox", { name: "Mention a member" })).getAllByRole("option");
  expect(options.map((option) => option.id)).toEqual(["sug-alex", "sug-sam"]);
  expect(options.map((option) => option.getAttribute("aria-selected"))).toEqual(["false", "true"]);
  expect(options[0].textContent).toContain("alex");
  expect(options[1].textContent).not.toContain("✓");

  fireEvent.click(options[0]);
  expect(onChoose).toHaveBeenCalledWith("alex");
});

it("MentionList shows its empty message when no member matches", () => {
  render(
    <MentionList
      id="sug"
      members={[]}
      active={0}
      empty="No results for “@zz”"
      onChoose={vi.fn()}
    />,
  );
  expect(screen.getByRole("status").textContent).toBe("No results for “@zz”");
});