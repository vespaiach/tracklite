import type { ComponentProps, ReactNode } from "react";
import {
  Button as AriaButton,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  type Key,
  type Selection,
  MenuTrigger,
  Popover,
  Separator,
} from "react-aria-components";
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

export type MenuProps = {
  label: string;
  icon?: ReactNode;
  text?: ReactNode;
  variant?: "quiet" | "secondary";
  selectedKey?: Key;
  onAction: (key: Key) => void;
  children: ReactNode;
  id?: string;
  "aria-describedby"?: string;
};

export function Menu({
  label,
  icon,
  text,
  variant = "quiet",
  selectedKey,
  onAction,
  children,
  id,
  "aria-describedby": describedBy,
}: MenuProps) {
  return (
    <MenuTrigger>
      <AriaButton
        id={id}
        aria-label={label}
        aria-describedby={describedBy}
        className={cx("tl-btn tl-btn--sm", `tl-btn--${variant}`, text === undefined && "tl-btn--icon")}>
        {text ?? icon}
      </AriaButton>
      <Popover placement="bottom end">
        <AriaMenu
          aria-label={label}
          className="tl-pop"
          {...(selectedKey === undefined
            ? { onAction }
            : {
                selectionMode: "single",
                disallowEmptySelection: true,
                selectedKeys: [selectedKey],
                onSelectionChange: (keys: Selection) => {
                  if (keys !== "all") for (const key of keys) onAction(key);
                },
              })}>
          {children}
        </AriaMenu>
      </Popover>
    </MenuTrigger>
  );
}

export function MenuItem({ id, danger, children }: { id: string; danger?: boolean; children: string }) {
  return (
    <AriaMenuItem
      id={id}
      textValue={children}
      className={cx("tl-pop__item", danger && "tl-pop__item--danger")}>
      {({ isSelected }) => (
        <>
          {children}
          {isSelected && <span className="tl-pop__check">✓</span>}
        </>
      )}
    </AriaMenuItem>
  );
}

export function MenuSep() {
  return <Separator className="tl-pop__sep" />;
}