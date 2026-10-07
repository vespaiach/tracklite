import { Children, cloneElement, useId, useState } from "react";
import type {
  ComponentProps,
  CSSProperties,
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  ReactElement,
  ReactNode,
} from "react";
import { cx } from "./cx";

export type PillProps = ComponentProps<"span"> & {
  kind: "id" | "status" | "project" | "cycle" | "label" | "est" | "ai" | "sync";
};

export function Pill({ kind, className, ...rest }: PillProps) {
  return (
    <span
      className={cx("tl-pill", `tl-pill--${kind}`, className)}
      {...rest}
    />
  );
}

export function Dot({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cx("tl-dot", className)}
    />
  );
}

export function Kbd({ className, onDark, ...rest }: ComponentProps<"kbd"> & { onDark?: boolean }) {
  return (
    <kbd
      className={cx("tl-kbd", onDark && "tl-kbd--dark", className)}
      {...rest}
    />
  );
}

export function Kbds({ keys, onDark }: { keys: string[]; onDark?: boolean }) {
  return (
    <span className="tl-kbds">
      {keys.map((key) => (
        <Kbd
          key={key}
          onDark={onDark}>
          {key}
        </Kbd>
      ))}
    </span>
  );
}

export type TipProps = ComponentProps<"span"> & { keys?: string[]; wide?: boolean };

export function Tip({ children, keys, wide, className, ...rest }: TipProps) {
  return (
    <span
      role="tooltip"
      className={cx("tl-tip", wide && "tl-tip--wide", className)}
      {...rest}>
      {children}
      {keys && (
        <Kbds
          keys={keys}
          onDark
        />
      )}
    </span>
  );
}

type TipTriggerChildProps = {
  "aria-describedby"?: string;
  onMouseEnter?: (event: MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (event: MouseEvent<HTMLElement>) => void;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onBlur?: (event: FocusEvent<HTMLElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
};

export type TipTriggerProps = {
  tip: ReactNode;
  keys?: string[];
  block?: boolean;
  wide?: boolean;
  open?: boolean;
  className?: string;
  children: ReactElement<TipTriggerChildProps>;
};

export function TipTrigger({ tip, keys, block, wide, open: forced, className, children }: TipTriggerProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const child = Children.only(children);
  const own = child.props;
  const shown = forced ?? open;
  return (
    <span className={cx("tl-tipwrap", block && "tl-tipwrap--block", className)}>
      {cloneElement(child, {
        "aria-describedby": cx(own["aria-describedby"], id),
        onMouseEnter: (event) => {
          own.onMouseEnter?.(event);
          setOpen(true);
        },
        onMouseLeave: (event) => {
          own.onMouseLeave?.(event);
          setOpen(false);
        },
        onFocus: (event) => {
          own.onFocus?.(event);
          if (event.currentTarget.matches(":focus-visible")) setOpen(true);
        },
        onBlur: (event) => {
          own.onBlur?.(event);
          setOpen(false);
        },
        onKeyDown: (event) => {
          own.onKeyDown?.(event);
          if (event.key === "Escape" && open) {
            event.stopPropagation();
            setOpen(false);
          }
        },
      })}
      <Tip
        id={id}
        keys={keys}
        wide={wide}
        hidden={!shown}
        className="tl-tipwrap__tip">
        {tip}
      </Tip>
    </span>
  );
}

export type AvatarProps = {
  initials?: string;
  tone?: "accent" | "accent-2" | "neutral";
  size?: "sm" | "md" | "lg";
  agent?: boolean;
  empty?: boolean;
  presence?: "on" | "off";
  className?: string;
  title?: string;
};

export function Avatar({
  initials,
  tone = "accent",
  size = "md",
  agent,
  empty,
  presence,
  className,
  title,
}: AvatarProps) {
  const look = agent ? "tl-avatar--agent" : empty ? "tl-avatar--empty" : `tl-avatar--${tone}`;
  return (
    <span
      title={title}
      className={cx("tl-avatar", `tl-avatar--${size}`, look, className)}>
      {initials}
      {presence && <span className={cx("tl-avatar__presence", `tl-avatar__presence--${presence}`)} />}
    </span>
  );
}

export function AvatarStack({
  children,
  more,
  small,
}: {
  children: ReactNode;
  more?: number;
  small?: boolean;
}) {
  return (
    <span className={cx("tl-avstack", small && "tl-avstack--sm")}>
      {children}
      {more ? <span className="tl-avstack__more">+{more}</span> : null}
    </span>
  );
}