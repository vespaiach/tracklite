import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LinkTabs, Segmented } from "./Segmented";

afterEach(cleanup);

it("Segmented checks the option matching the value and reports the chosen one", () => {
  const onChange = vi.fn();
  render(
    <Segmented
      name="view"
      options={[
        { value: "list", label: "List" },
        { value: "board", label: "Board" },
      ]}
      value="list"
      onChange={onChange}
    />,
  );
  expect((screen.getByLabelText("List") as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText("Board") as HTMLInputElement).checked).toBe(false);

  fireEvent.click(screen.getByLabelText("Board"));
  expect(onChange).toHaveBeenCalledWith("board");
});

it("LinkTabs: the soft variant marks the current tab with aria-current and shows each tab's icon hidden from screen readers", () => {
  render(
    <LinkTabs
      label="Project views"
      variant="soft"
      options={[
        { href: "/project/WEB", label: "Board", icon: <svg data-testid="board-icon" />, current: true },
        { href: "/project/WEB/list", label: "List", icon: <svg data-testid="list-icon" /> },
      ]}
    />,
  );
  const nav = screen.getByRole("navigation", { name: "Project views" });
  expect(nav.classList.contains("tl-seg--soft")).toBe(true);

  const board = screen.getByRole("link", { name: "Board" });
  expect(board.getAttribute("aria-current")).toBe("page");
  expect(board.hasAttribute("data-on")).toBe(true);
  expect(screen.getByRole("link", { name: "List" }).hasAttribute("aria-current")).toBe(false);

  expect(screen.getByTestId("board-icon").closest("[aria-hidden='true']")).not.toBeNull();
});