import type { ComponentProps } from "react";
import { cx } from "./cx";

export type LogoProps = ComponentProps<"span"> & { size: "rail" | "signed-out" };

export function Logo({ size, className, ...rest }: LogoProps) {
  return (
    <span
      className={cx("tl-logo", `tl-logo--${size}`, className)}
      {...rest}>
      <LogoMark />
      <span className="tl-logo__word">Tracklite</span>
    </span>
  );
}

function LogoMark() {
  return (
    <svg
      className="tl-logo__mark"
      viewBox="0 0 48 48"
      aria-hidden="true">
      <rect
        className="tl-logo__shadow"
        x="6"
        y="15"
        width="28"
        height="24"
        rx="1.5"
      />
      <g transform="rotate(-9 28 23)">
        <rect
          className="tl-logo__card"
          x="14"
          y="10"
          width="28"
          height="24"
          rx="1.5"
        />
        <rect
          className="tl-logo__line"
          x="19"
          y="16"
          width="15"
          height="4"
        />
        <rect
          className="tl-logo__line tl-logo__line--faint"
          x="19"
          y="23"
          width="9"
          height="4"
        />
      </g>
    </svg>
  );
}