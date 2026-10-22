import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CommandMenu, FilterPicker } from "./CommandMenu";
import { PickerItem } from "./Pop";

afterEach(cleanup);

const commands = (run = vi.fn()) => [
  { id: "new", label: "Create new issue", run },
  { id: "board", label: "Switch to board view", run: vi.fn() },
];

it("CommandMenu: filters ignoring case, says when nothing matches, runs the highlighted command on Enter and closes on Escape", () => {
  const onClose = vi.fn();
  const list = commands();
  render(
    <CommandMenu
      open
      inline
      onClose={onClose}
      commands={list}
    />,
  );
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "BOARD" } });
  expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Switch to board view"]);

  fireEvent.change(input, { target: { value: "zzz" } });
  expect(screen.getByText("No results for “zzz”")).toBeTruthy();

  fireEvent.change(input, { target: { value: "" } });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(list[1].run).toHaveBeenCalledOnce();
  expect(list[0].run).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();

  fireEvent.keyDown(input, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(2);
});

it("CommandMenu overlay: focuses the search box and closes on a press outside the panel only", () => {
  const onClose = vi.fn();
  render(
    <CommandMenu
      open
      onClose={onClose}
      commands={commands()}
    />,
  );
  expect(document.activeElement).toBe(screen.getByRole("textbox"));

  const panel = screen.getByRole("dialog", { name: "Command menu" });
  fireEvent.mouseDown(panel);
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.mouseDown(panel.parentElement as HTMLElement);
  expect(onClose).toHaveBeenCalledOnce();
});

const statusNames: Record<string, string> = { in_progress: "In Progress", in_review: "In Review" };

function StatusFilter() {
  const [chosen, setChosen] = useState<string[]>([]);
  return (
    <FilterPicker
      field="Status"
      values={chosen.map((key) => statusNames[key])}
      selectedKeys={chosen}
      onToggle={(key) =>
        setChosen((keys) =>
          keys.includes(String(key)) ? keys.filter((each) => each !== key) : [...keys, String(key)],
        )
      }
      onClear={() => setChosen([])}>
      {Object.entries(statusNames).map(([key, name]) => (
        <PickerItem
          key={key}
          id={key}
          textValue={name}>
          {name}
        </PickerItem>
      ))}
    </FilterPicker>
  );
}

function trigger() {
  return screen.getByRole("button", { name: /^Status/, hidden: true });
}

it("with values it becomes a rule reading “is” or “is any of”, and × clears it", async () => {
  render(<StatusFilter />);
  fireEvent.click(trigger());
  fireEvent.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "In Progress" }));
  expect(trigger().closest(".tl-filter-rule")?.textContent).toContain("StatusisIn Progress");

  fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "In Review" }));
  expect(trigger().closest(".tl-filter-rule")?.textContent).toContain(
    "Statusis any ofIn Progress, In Review",
  );

  fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Clear status filter" }));
  expect(trigger().classList.contains("tl-filter-add")).toBe(true);
});