import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Table, TableSortHead, type TableSort } from "./Table";

afterEach(cleanup);

function renderHead(sort: TableSort, onSort = vi.fn()) {
  render(
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
    </Table>,
  );
  return onSort;
}

it("a sortable heading is a button in a column header that calls onSort", () => {
  const onSort = renderHead("none");
  const head = screen.getByRole("columnheader", { name: "Priority" });
  expect(head.getAttribute("aria-sort")).toBe("none");
  fireEvent.click(screen.getByRole("button", { name: "Priority" }));
  expect(onSort).toHaveBeenCalledOnce();
});

it("shows an arrow only on the sorted heading, with aria-sort giving the direction", () => {
  renderHead("none");
  expect(screen.getByRole("columnheader").querySelector("svg")).toBeNull();
  cleanup();

  renderHead("ascending");
  expect(screen.getByRole("columnheader").getAttribute("aria-sort")).toBe("ascending");
  expect(screen.getByRole("columnheader").querySelector("svg")).not.toBeNull();
  cleanup();

  renderHead("descending");
  expect(screen.getByRole("columnheader").getAttribute("aria-sort")).toBe("descending");
  expect(screen.getByRole("columnheader").querySelector("svg")).not.toBeNull();
});