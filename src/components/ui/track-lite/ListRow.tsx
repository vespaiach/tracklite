import type { ReactNode } from "react";
import { cx } from "./cx";

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

export function ListDate({ children }: { children: ReactNode }) {
  return <span className="tl-list-date">{children}</span>;
}

export function Board({ children }: { children: ReactNode }) {
  return <div className="tl-board">{children}</div>;
}

export type BoardColumnProps = { label: string; count?: number; icon?: ReactNode; children: ReactNode };

export function BoardColumn({ label, count, icon, children }: BoardColumnProps) {
  return (
    <section className="tl-board-col">
      <div className="tl-board-col__head">
        {icon}
        {label}
        {count != null && <span className="tl-board-col__count">{count}</span>}
      </div>
      <div className="tl-board-col__body">{children}</div>
    </section>
  );
}

export type BoardCardProps = {
  id: string;
  title: string;
  top?: ReactNode;
  assignee?: ReactNode;
  foot?: ReactNode;
  dragging?: boolean;
  onClick?: () => void;
};

export function BoardCard({ id, title, top, assignee, foot, dragging, onClick }: BoardCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("tl-board-card", dragging && "tl-board-card--dragging")}>
      <span className="tl-board-card__top">
        {top}
        {id}
        {assignee && <span className="tl-board-card__assignee">{assignee}</span>}
      </span>
      <span className="tl-board-card__title">{title}</span>
      {foot && <span className="tl-board-card__foot">{foot}</span>}
    </button>
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