import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export function IssueLayout({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="tl-issue-layout">
      <div className="tl-issue-layout__main">{main}</div>
      <aside className="tl-issue-layout__side">{side}</aside>
    </div>
  );
}

export function IssueTitle({ children }: { children: ReactNode }) {
  return <h1 className="tl-issue-title">{children}</h1>;
}

export function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tl-meta">
      <div className="tl-meta__label">{label}</div>
      <div className="tl-meta__value">{children}</div>
    </div>
  );
}

export type PickProps = ComponentProps<"button"> & { empty?: boolean; kbd?: ReactNode };

export function Pick({ empty, children, kbd, className, ...rest }: PickProps) {
  return (
    <button
      type="button"
      className={cx("tl-pick", empty && "tl-pick--empty", className)}
      {...rest}>
      {children}
      {kbd && <span className="tl-pick__kbd">{kbd}</span>}
    </button>
  );
}

export function Prose({ className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      className={cx("tl-prose", className)}
      {...rest}
    />
  );
}

export function Mention({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      className="tl-mention"
      title={title}>
      {children}
    </span>
  );
}

export function IssueLink({ children, href = "#" }: { children: ReactNode; href?: string }) {
  return (
    <a
      href={href}
      className="tl-issue-link">
      {children}
    </a>
  );
}

export type EditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  tools?: ReactNode;
  submit?: ReactNode;
  textarea?: Omit<ComponentProps<"textarea">, "value" | "onChange" | "placeholder">;
};

export function Editor({ value, onChange, placeholder, tools, submit, textarea }: EditorProps) {
  return (
    <div className="tl-editor">
      <textarea
        rows={3}
        {...textarea}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <div className="tl-editor__bar">
        <div className="tl-editor__tools">{tools}</div>
        <div className="tl-editor__submit">{submit}</div>
      </div>
    </div>
  );
}

export function EditorTool({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="tl-editor-tool">
      {children}
    </button>
  );
}

export function Feed({ children }: { children: ReactNode }) {
  return <div className="tl-feed">{children}</div>;
}

export function FeedItem({ mark, children }: { mark?: ReactNode; children: ReactNode }) {
  return (
    <div className="tl-feed-item">
      <span className="tl-feed-item__mark">{mark ?? <span className="tl-feed-item__dot" />}</span>
      {children}
    </div>
  );
}

export function FeedLine({ children }: { children: ReactNode }) {
  return <div className="tl-feed-line">{children}</div>;
}

export function FeedTime({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("tl-feed-time", className)}>{children}</span>;
}

export type CommentProps = { avatar: ReactNode; author: string; time: string; children: ReactNode };

export function Comment({ avatar, author, time, children }: CommentProps) {
  return (
    <div className="tl-comment">
      <div className="tl-comment__head">
        {avatar}
        <b>{author}</b>
        <FeedTime>{time}</FeedTime>
      </div>
      <Prose>{children}</Prose>
    </div>
  );
}