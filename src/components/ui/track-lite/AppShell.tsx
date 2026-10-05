import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import type { ComponentProps, CSSProperties, MouseEvent, ReactNode, Ref } from "react";
import { cx } from "./cx";

export type AppShellProps = {
  collapsed?: boolean;
  rail: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function AppShell({ collapsed, rail, children, className, style }: AppShellProps) {
  return (
    <div
      data-collapsed={collapsed || undefined}
      className={cx("tl-shell", className)}
      style={style}>
      {rail}
      <div className="tl-shell__body">{children}</div>
    </div>
  );
}

export function Lbl({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("tl-lbl", className)}>{children}</span>;
}

export function Rail({ head, foot, children }: { head?: ReactNode; foot?: ReactNode; children: ReactNode }) {
  return (
    <aside className="tl-rail">
      {head && <div className="tl-rail__head">{head}</div>}
      <div className="tl-rail__main">{children}</div>
      {foot && <div className="tl-rail__foot">{foot}</div>}
    </aside>
  );
}

export function RailGroup({ children }: { children: ReactNode }) {
  return <div className="tl-rail-group">{children}</div>;
}

export function RailLabel({
  children,
  count,
  action,
}: {
  children: ReactNode;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="tl-rail-label">
      {children}
      {count != null && <span className="tl-rail-label__count">{count}</span>}
      {action}
    </div>
  );
}

export type RailLabelActionProps = Omit<ComponentProps<"button">, "children"> & {
  label: string;
  icon?: ReactNode;
};

export function RailLabelAction({ label, icon, className, ...rest }: RailLabelActionProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cx("tl-rail-label__action", className)}
      {...rest}>
      {icon ?? (
        <Plus
          size={12}
          weight="bold"
        />
      )}
    </button>
  );
}

export type RailItemProps = {
  icon: ReactNode;
  label: string;
  suffix?: string;
  count?: number;
  end?: ReactNode;
  current?: boolean;
  href?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  className?: string;
  title?: string;
  ref?: Ref<HTMLElement>;
};

export function RailItem({
  icon,
  label,
  suffix,
  count,
  end,
  current,
  href,
  onClick,
  className,
  title,
  ref,
}: RailItemProps) {
  const content = (
    <>
      {icon}
      {suffix ? (
        <span className="tl-lbl tl-rail-item__split">
          <span className="tl-rail-item__name">{label}</span>
          <span className="tl-rail-item__suffix">{suffix}</span>
        </span>
      ) : (
        <Lbl>{label}</Lbl>
      )}
      {count != null && <span className="tl-rail-item__count">{count}</span>}
      {end && <span className="tl-rail-item__end">{end}</span>}
    </>
  );
  const shared = {
    title: title === undefined ? label + (suffix ?? "") : title || undefined,
    "aria-current": current ? ("page" as const) : undefined,
    onClick,
    className: cx("tl-rail-item", className),
  };
  return href ? (
    <a
      ref={ref as Ref<HTMLAnchorElement>}
      href={href}
      {...shared}>
      {content}
    </a>
  ) : (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      {...shared}>
      {content}
    </button>
  );
}

export type WorkspaceSwitcherProps = {
  mark: string;
  name: string;
  sub?: string;
  onClick?: () => void;
  caret?: ReactNode;
};

export function WorkspaceSwitcher({ mark, name, sub, onClick, caret }: WorkspaceSwitcherProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tl-ws">
      <span className="tl-ws__mark">{mark}</span>
      <span className="tl-ws__text">
        <b className="tl-ws__name">{name}</b>
        {sub && <small className="tl-ws__sub">{sub}</small>}
      </span>
      {caret && <span className="tl-ws__caret">{caret}</span>}
    </button>
  );
}

export function AppBar({ sub, children, end }: { sub?: boolean; children: ReactNode; end?: ReactNode }) {
  return (
    <header className={cx("tl-appbar", sub && "tl-appbar--sub")}>
      {children}
      {end && <div className="tl-appbar__end">{end}</div>}
    </header>
  );
}

export function AppBarTitle({ children }: { children: ReactNode }) {
  return <h1 className="tl-appbar__title">{children}</h1>;
}

export type Crumb = { label: string; href?: string; onClick?: () => void };

export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="tl-crumbs">
      {items.map((crumb, index) => (
        <span
          key={crumb.label}
          className="tl-crumbs__item">
          {index > 0 && <span className="tl-crumbs__sep">/</span>}
          {index === items.length - 1 ? (
            <b>{crumb.label}</b>
          ) : (
            <a
              href={crumb.href ?? "#"}
              onClick={crumb.onClick}>
              {crumb.label}
            </a>
          )}
        </span>
      ))}
    </nav>
  );
}