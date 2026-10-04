import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Segmented } from "./Segmented";

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