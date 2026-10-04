import type { ComponentProps } from "react";
import { cx } from "./cx";

export type CardProps = ComponentProps<"div"> & { elevation?: "sm" | "md" | "lg" };

export function Card({ elevation, className, ...rest }: CardProps) {
  return (
    <div
      className={cx("tl-card", elevation && `tl-card--${elevation}`, className)}
      {...rest}
    />
  );
}

export function CardKicker({ className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      className={cx("tl-card__kicker", className)}
      {...rest}
    />
  );
}

export function CardTitle({ className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      className={cx("tl-card__title", className)}
      {...rest}
    />
  );
}

export function CardBody({ className, ...rest }: ComponentProps<"p">) {
  return (
    <p
      className={cx("tl-card__body", className)}
      {...rest}
    />
  );
}

export function CardMeta({ className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      className={cx("tl-card__meta", className)}
      {...rest}
    />
  );
}