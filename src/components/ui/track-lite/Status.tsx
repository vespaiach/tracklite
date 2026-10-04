import { cx } from "./cx";

export type StatusKind = "backlog" | "todo" | "progress" | "review" | "done" | "canceled";
export type PriorityKind = "urgent" | "high" | "med" | "low" | "none";

const arcs: Partial<Record<StatusKind, string>> = { progress: "60%", review: "85%" };

export function Status({
  status,
  large,
  className,
}: {
  status: StatusKind;
  large?: boolean;
  className?: string;
}) {
  const arc = arcs[status];
  return (
    <span
      role="img"
      aria-label={status}
      className={cx("tl-status", large && "tl-status--lg", `tl-status--${status}`, className)}>
      {arc && (
        <span
          className="tl-status__arc"
          style={{ background: `conic-gradient(currentColor 0 ${arc}, transparent 0)` }}
        />
      )}
      {status === "done" && <span className="tl-status__check" />}
      {status === "canceled" && <span className="tl-status__strike" />}
    </span>
  );
}

const litBars: Record<Exclude<PriorityKind, "urgent">, number> = { high: 3, med: 2, low: 1, none: 0 };
const barHeights = [4, 7.5, 11];

export function Priority({ priority, className }: { priority: PriorityKind; className?: string }) {
  if (priority === "urgent") {
    return (
      <span
        role="img"
        aria-label="urgent"
        className={cx("tl-prio-urgent", className)}>
        !
      </span>
    );
  }
  const lit = litBars[priority];
  return (
    <span
      role="img"
      aria-label={priority}
      className={cx("tl-prio", className)}>
      {barHeights.map((height, index) => (
        <i
          key={height}
          style={{ height: priority === "none" ? 1.5 : height, opacity: index < lit ? 1 : 0.25 }}
        />
      ))}
    </span>
  );
}

export function Glyph({
  kind,
  className,
}: {
  kind: "sq" | "ci" | "di" | "ln" | "half" | "plus";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx("tl-glyph", `tl-glyph--${kind}`, className)}>
      <span />
    </span>
  );
}