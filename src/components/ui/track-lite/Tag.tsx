import type { ComponentProps } from "react";
import { cx } from "./cx";

export type TagProps = ComponentProps<"span"> & { variant?: "accent" | "accent-2" | "neutral" | "outline" };

export function Tag({ variant = "accent", className, ...rest }: TagProps) {
  return (
    <span
      className={cx("tl-tag", `tl-tag--${variant}`, className)}
      {...rest}
    />
  );
}