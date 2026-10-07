import { ArrowDown } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export type TableProps = ComponentProps<"table"> & {
  sticky?: boolean;
  columns?: Record<string, string>;
  minWidth?: string;
};

export function Table({ className, sticky, columns, minWidth, children, ...rest }: TableProps) {
  return (
    <table
      className={cx("tl-table", sticky && "tl-table--sticky", columns && "tl-table--fixed", className)}
      style={minWidth ? { minWidth } : undefined}
      {...rest}>
      {columns && (
        <colgroup>
          {Object.entries(columns).map(([name, width]) => (
            <col
              key={name}
              style={{ width }}
            />
          ))}
        </colgroup>
      )}
      {children}
    </table>
  );
}

export type TableSort = "none" | "ascending" | "descending";

export type TableSortHeadProps = {
  sort: TableSort;
  onSort: () => void;
  className?: string;
  children: ReactNode;
};

export function TableSortHead({ sort, onSort, className, children }: TableSortHeadProps) {
  const Arrow = sort === "ascending" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={sort}
      className={className}>
      <button
        type="button"
        onClick={onSort}
        className={cx("tl-table__sort", sort !== "none" && "tl-table__sort--on")}>
        {children}
        {sort !== "none" && (
          <Arrow
            aria-hidden="true"
            size={11}
          />
        )}
      </button>
    </th>
  );
}