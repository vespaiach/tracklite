import type { ComponentProps, CSSProperties, ReactNode } from "react";
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

export function Tip({ children, keys }: { children: ReactNode; keys?: string[] }) {
  return (
    <span
      role="tooltip"
      className="tl-tip">
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