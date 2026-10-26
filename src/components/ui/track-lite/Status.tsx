import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  Circle,
  Ellipsis,
  type LucideIcon,
  SignalHigh,
  SignalLow,
  SignalMedium,
} from "lucide-react";
import { cx } from "./cx";

export type StatusKind = "backlog" | "todo" | "progress" | "review" | "done" | "canceled";
export type PriorityKind = "urgent" | "high" | "med" | "low" | "none";

const statusGlyphs: Record<StatusKind, LucideIcon> = {
  backlog: CircleDashed,
  todo: Circle,
  progress: CircleDot,
  review: CircleDot,
  done: CircleCheck,
  canceled: CircleX,
};

const priorityGlyphs: Record<PriorityKind, LucideIcon> = {
  urgent: CircleAlert,
  high: SignalHigh,
  med: SignalMedium,
  low: SignalLow,
  none: Ellipsis,
};

export function Status({ status, className }: { status: StatusKind; className?: string }) {
  const Icon = statusGlyphs[status];
  return (
    <span
      role="img"
      aria-label={status}
      className={cx("tl-status", `tl-status--${status}`, className)}>
      <Icon size={14} />
    </span>
  );
}

export function Priority({ priority, className }: { priority: PriorityKind; className?: string }) {
  const Icon = priorityGlyphs[priority];
  return (
    <span
      role="img"
      aria-label={priority}
      className={cx("tl-prio", `tl-prio--${priority}`, className)}>
      <Icon size={14} />
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