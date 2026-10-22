import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Table, TableSortHead, type TableSort } from "./Table";

afterEach(cleanup);

function head(sort: TableSort, onSort: () => void) {
  return (
    <Table>
      <thead>
        <tr>
          <TableSortHead
            sort={sort}
            onSort={onSort}>
            Priority
          </TableSortHead>
        </tr>
      </thead>
    </Table>
  );
}

it("a sortable heading is a button in a column header that calls onSort; only the sorted heading shows an arrow, with aria-sort giving the direction", () => {
  const onSort = vi.fn();
  const { rerender } = render(head("none", onSort));
  const column = () => screen.getByRole("columnheader", { name: "Priority" });
  expect(column().getAttribute("aria-sort")).toBe("none");
  expect(column().querySelector("svg")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Priority" }));
  expect(onSort).toHaveBeenCalledOnce();

  rerender(head("ascending", onSort));
  expect(column().getAttribute("aria-sort")).toBe("ascending");
  expect(column().querySelector("svg")).not.toBeNull();

  rerender(head("descending", onSort));
  expect(column().getAttribute("aria-sort")).toBe("descending");
  expect(column().querySelector("svg")).not.toBeNull();
});