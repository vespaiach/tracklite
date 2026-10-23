import { ArrowDown } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { type MouseEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { cx } from "./cx";
import type { TableSort } from "./Table";

export type ListGroupProps = { label: string; count?: number; icon?: ReactNode; action?: ReactNode };

export function ListGroup({ label, count, icon, action }: ListGroupProps) {
  return (
    <div className="tl-list-group">
      {icon}
      {label}
      {count != null && <span className="tl-list-group__count">{count}</span>}
      {action && <span className="tl-list-group__action">{action}</span>}
    </div>
  );
}

export type CollapsibleListGroupProps = {
  id: string;
  label: string;
  count: number;
  icon?: ReactNode;
  defaultExpanded?: boolean;
  skipTo?: { id: string; label: string };
  children: ReactNode;
};

export function CollapsibleListGroup({
  id,
  label,
  count,
  icon,
  defaultExpanded = true,
  skipTo,
  children,
}: CollapsibleListGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <>
      <h2 className="tl-list-group tl-list-group--toggle">
        <button
          type="button"
          id={id}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="tl-list-group__head">
          <CaretDown
            aria-hidden="true"
            size={12}
            className="tl-list-group__caret"
          />
          {icon}
          {label} <span className="tl-list-group__count">{count}</span>
        </button>
      </h2>
      {expanded && skipTo && <SkipLink target={skipTo} />}
      {expanded && children}
    </>
  );
}

function SkipLink({ target }: { target: { id: string; label: string } }) {
  const focusTarget = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById(target.id)?.focus();
  };

  return (
    <a
      href={`#${target.id}`}
      onClick={focusTarget}
      className="tl-list-group__skip">
      Skip to {target.label}
    </a>
  );
}

export type ListRowHeadProps = { columns: string; label?: string; children: ReactNode };

export function ListRowHead({ columns, label, children }: ListRowHeadProps) {
  const style = { gridTemplateColumns: columns };
  if (label) {
    return (
      <fieldset
        aria-label={label}
        className="tl-list-head"
        style={style}>
        {children}
      </fieldset>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="tl-list-head"
      style={style}>
      {children}
    </div>
  );
}

export type ListSortButtonProps = { sort: TableSort; onSort: () => void; children: ReactNode };

export function ListSortButton({ sort, onSort, children }: ListSortButtonProps) {
  const Arrow = sort === "ascending" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onSort}
      className={cx("tl-list-head__sort", sort !== "none" && "tl-list-head__sort--on")}>
      {children}
      {sort !== "none" && (
        <>
          <span className="sr-only">, sorted {sort}</span>
          <Arrow
            aria-hidden="true"
            size={11}
          />
        </>
      )}
    </button>
  );
}

export type ListRowLinkProps = {
  columns: string;
  href: string;
  label?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  children: ReactNode;
};

export function ListRowLink({ columns, href, label, onClick, children }: ListRowLinkProps) {
  return (
    <a
      href={href}
      aria-label={label}
      onClick={onClick}
      className="tl-list-row tl-list-row--link"
      style={{ gridTemplateColumns: columns }}>
      {children}
    </a>
  );
}

export type ListRowProps = {
  selected?: boolean;
  checked?: boolean;
  priority: ReactNode;
  id: string;
  status: ReactNode;
  title: string;
  end?: ReactNode;
  onClick?: () => void;
};

export function ListRow({ selected, checked, priority, id, status, title, end, onClick }: ListRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx("tl-list-row", selected && "tl-list-row--selected")}>
      <span className={cx("tl-list-row__check", (selected || checked) && "tl-list-row__check--on")} />
      {priority}
      <span className="tl-list-row__idwrap">
        <span className="tl-list-row__id">{id}</span>
        {status}
      </span>
      <span className="tl-list-row__title">{title}</span>
      <span className="tl-list-row__end">{end}</span>
    </button>
  );
}

export function ListNote({ children }: { children: ReactNode }) {
  return <p className="tl-list-note">{children}</p>;
}

export function ListDate({ children }: { children: ReactNode }) {
  return <span className="tl-list-date">{children}</span>;
}

export function Board({ children }: { children: ReactNode }) {
  return <div className="tl-board">{children}</div>;
}

export type BoardColumnProps = {
  label: string;
  count?: number;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
};

function useScrolledDown() {
  const [scrolled, setScrolled] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const onScroll = (event: Event) => setScrolled((event.target as HTMLElement).scrollTop > 0);
    element.addEventListener("scroll", onScroll, true);
    return () => element.removeEventListener("scroll", onScroll, true);
  }, []);

  return [container, scrolled] as const;
}

export function BoardColumn({ label, count, icon, action, children }: BoardColumnProps) {
  const [body, scrolled] = useScrolledDown();
  return (
    <section
      aria-label={label}
      data-scrolled={scrolled || undefined}
      className="tl-board-col">
      <div className="tl-board-col__head">
        {icon}
        <h2
          title={label}
          className="tl-board-col__label">
          {label}
        </h2>
        {count != null && <span className="tl-board-col__count">{count}</span>}
        {action}
      </div>
      <div
        ref={body}
        className="tl-board-col__body">
        {children}
      </div>
    </section>
  );
}

export type BoardEmptyProps = { children: ReactNode; action?: string; onAction?: () => void };

export function BoardEmpty({ children, action, onAction }: BoardEmptyProps) {
  return (
    <p className="tl-board-empty">
      {children}
      {action && (
        <>
          {" "}
          <button
            type="button"
            onClick={onAction}
            className="tl-board-empty__action">
            {action}
          </button>
        </>
      )}
    </p>
  );
}

export type BoardCardProps = {
  id: string;
  title: string;
  href: string;
  onOpen?: (event: MouseEvent<HTMLAnchorElement>) => void;
  handle?: ReactNode;
  priority?: ReactNode;
  assignee?: ReactNode;
  menu?: ReactNode;
  foot?: ReactNode;
  closed?: boolean;
  dragging?: boolean;
};

export function BoardCard({
  id,
  title,
  href,
  onOpen,
  handle,
  priority,
  assignee,
  menu,
  foot,
  closed,
  dragging,
}: BoardCardProps) {
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      className={cx(
        "tl-board-card",
        menu && "tl-board-card--menu",
        assignee && "tl-board-card--assignee",
        closed && "tl-board-card--closed",
        dragging && "tl-board-card--dragging",
      )}>
      <span className="tl-board-card__top">
        {priority && <span className="tl-board-card__prio">{priority}</span>}
        {id}
        {assignee && <span className="tl-board-card__assignee">{assignee}</span>}
      </span>
      {handle && <span className="tl-board-card__act tl-board-card__handle">{handle}</span>}
      <a
        id={titleId}
        href={href}
        onClick={onOpen}
        className="tl-board-card__title">
        {title}
      </a>
      {foot && <span className="tl-board-card__foot">{foot}</span>}
      {menu && <span className="tl-board-card__act tl-board-card__menu">{menu}</span>}
    </article>
  );
}

export function BoardDrop() {
  return <div className="tl-board-drop" />;
}

export type ProjectCardProps = { icon?: ReactNode; title: string; note?: string; foot?: ReactNode };

export function ProjectCard({ icon, title, note, foot }: ProjectCardProps) {
  return (
    <div className="tl-project-card">
      <div className="tl-project-card__head">
        {icon}
        <span className="tl-project-card__title">{title}</span>
      </div>
      {note && <p className="tl-project-card__note">{note}</p>}
      {foot && <div className="tl-project-card__foot">{foot}</div>}
    </div>
  );
}

export type DrawerProps = {
  head: ReactNode;
  children: ReactNode;
  floating?: boolean;
  onClose?: () => void;
  closeIcon?: ReactNode;
};

export function Drawer({ head, children, floating, onClose, closeIcon }: DrawerProps) {
  return (
    <aside className={cx("tl-drawer", floating && "tl-drawer--floating")}>
      <div className="tl-drawer__head">
        {head}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tl-drawer__close">
            {closeIcon ?? "×"}
          </button>
        )}
      </div>
      <div className="tl-drawer__body">{children}</div>
    </aside>
  );
}