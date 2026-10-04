import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CommandMenu } from "./CommandMenu";

afterEach(cleanup);

const commands = (run = vi.fn()) => [
  { id: "new", label: "Create new issue", run },
  { id: "board", label: "Switch to board view", run: vi.fn() },
];

it("filters commands by the typed text, ignoring case", () => {
  render(
    <CommandMenu
      open
      inline
      onClose={() => {}}
      commands={commands()}
    />,
  );
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "BOARD" } });
  expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Switch to board view"]);
});

it("says when nothing matches", () => {
  render(
    <CommandMenu
      open
      inline
      onClose={() => {}}
      commands={commands()}
    />,
  );
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "zzz" } });
  expect(screen.getByText("No results for “zzz”")).toBeTruthy();
});

it("runs the highlighted command on Enter and closes", () => {
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
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(list[1].run).toHaveBeenCalledOnce();
  expect(list[0].run).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
});

it("closes on Escape", () => {
  const onClose = vi.fn();
  render(
    <CommandMenu
      open
      inline
      onClose={onClose}
      commands={commands()}
    />,
  );
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});
it("closes on a press outside the panel but not inside it", () => {
  const onClose = vi.fn();
  render(
    <CommandMenu
      open
      onClose={onClose}
      commands={commands()}
    />,
  );
  const panel = screen.getByRole("dialog", { name: "Command menu" });
  fireEvent.mouseDown(panel);
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.mouseDown(panel.parentElement as HTMLElement);
  expect(onClose).toHaveBeenCalledOnce();
});

it("focuses the search box when opened as an overlay", () => {
  render(
    <CommandMenu
      open
      onClose={() => {}}
      commands={commands()}
    />,
  );
  expect(document.activeElement).toBe(screen.getByRole("textbox"));
});