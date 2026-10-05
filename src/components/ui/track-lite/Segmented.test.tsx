import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LinkTabs, Segmented } from "./Segmented";

afterEach(cleanup);

const options = [
  { value: "list", label: "List" },
  { value: "board", label: "Board" },
];

it("checks the option matching the value", () => {
  render(
    <Segmented
      name="view"
      options={options}
      value="board"
      onChange={() => {}}
    />,
  );
  expect((screen.getByLabelText("Board") as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText("List") as HTMLInputElement).checked).toBe(false);
});

it("reports the chosen option's value", () => {
  const onChange = vi.fn();
  render(
    <Segmented
      name="view"
      options={options}
      value="list"
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByLabelText("Board"));
  expect(onChange).toHaveBeenCalledWith("board");
});

it("renders link tabs as navigation with only the current view marked", () => {
  render(
    <LinkTabs
      label="Project views"
      options={[
        { href: "/project/WEB/board", label: "Board", current: true },
        { href: "/project/WEB/list", label: "List" },
      ]}
    />,
  );
  expect(screen.getByRole("navigation", { name: "Project views" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Board" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "List" }).hasAttribute("aria-current")).toBe(false);
});