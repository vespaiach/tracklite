import type { ComponentProps } from "react";
import { cx } from "./cx";

export type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "quiet" | "danger" | "danger-outline";
  size?: "md" | "sm";
  icon?: boolean;
  block?: boolean;
  busy?: string;
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  block,
  busy,
  className,
  type = "button",
  disabled,
  children,
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
      disabled={disabled || busy !== undefined}
      {...rest}>
      {busy ?? children}
    </button>
  );
}