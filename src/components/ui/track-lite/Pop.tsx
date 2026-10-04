import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export function Pop({ className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      role="listbox"
      className={cx("tl-pop", className)}
      {...rest}
    />
  );
}

export function PopSearch({ icon, ...rest }: ComponentProps<"input"> & { icon?: ReactNode }) {
  return (
    <div className="tl-pop__search">
      {icon}
      <input {...rest} />
    </div>
  );
}

export function PopLabel({ children }: { children: ReactNode }) {
  return <div className="tl-pop__label">{children}</div>;
}

export function PopSep() {
  return <div className="tl-pop__sep" />;
}

export type PopItemProps = ComponentProps<"button"> & {
  selected?: boolean;
  danger?: boolean;
  end?: ReactNode;
};

export function PopItem({
  selected,
  disabled,
  danger,
  end,
  className,
  children,
  onClick,
  ...rest
}: PopItemProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected || undefined}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      className={cx("tl-pop__item", danger && "tl-pop__item--danger", className)}
      {...rest}>
      {children}
      {end && <span className="tl-pop__end">{end}</span>}
      {selected && !end && <span className="tl-pop__check">✓</span>}
    </button>
  );
}

export function PopFoot({ children }: { children: ReactNode }) {
  return <div className="tl-pop__foot">{children}</div>;
}