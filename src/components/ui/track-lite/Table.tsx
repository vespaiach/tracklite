import type { ComponentProps } from "react";
import { cx } from "./cx";

export function Table({ className, ...rest }: ComponentProps<"table">) {
  return (
    <table
      className={cx("tl-table", className)}
      {...rest}
    />
  );
}