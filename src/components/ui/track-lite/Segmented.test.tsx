import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Segmented } from "./Segmented";

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