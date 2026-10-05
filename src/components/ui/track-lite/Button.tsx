import type { ComponentProps } from "react";
import { cx } from "./cx";

export type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "quiet" | "danger";
  size?: "md" | "sm";
  icon?: boolean;
  block?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  block,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "tl-btn",
        `tl-btn--${size}`,
        `tl-btn--${variant}`,
        icon && "tl-btn--icon",
        block && "tl-btn--block",
        className,
      )}
      {...rest}
    />
  );
}