import type { ReactNode } from "react";
import { cx } from "./cx";

const tone = {
  done: "var(--color-accent-600)",
  active: "var(--color-accent-2-500)",
  todo: "var(--color-accent-300)",
};

export type ProgressProps = { done: number; active?: number; todo?: number; large?: boolean };

export function Progress({ done, active = 0, todo = 0, large }: ProgressProps) {
  return (
    <div className={cx("tl-progress", large && "tl-progress--lg")}>
      <i style={{ width: `${done}%`, background: tone.done }} />
      <i style={{ width: `${active}%`, background: tone.active }} />
      <i style={{ width: `${todo}%`, background: tone.todo }} />
    </div>
  );
}

export function ProgressKey({ items }: { items: { label: string; tone: keyof typeof tone }[] }) {
  return (
    <div className="tl-progress-key">
      {items.map((item) => (
        <span key={item.label}>
          <i style={{ background: tone[item.tone] }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function Ring({ pct }: { pct: number }) {
  return (
    <span
      className="tl-ring"
      style={{ background: `conic-gradient(var(--color-accent-600) 0 ${pct}%, var(--color-neutral-200) 0)` }}>
      <span className="tl-ring__hole" />
      <b>{pct}%</b>
    </span>
  );
}

export function Metric({ value, label, delta }: { value: ReactNode; label: string; delta?: string }) {
  return (
    <div className="tl-metric">
      <div className="tl-metric__value">{value}</div>
      <div className="tl-metric__label">{label}</div>
      {delta && <div className="tl-metric__delta">{delta}</div>}
    </div>
  );
}

export function Spark({ values, highlight = [] }: { values: number[]; highlight?: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div
      className="tl-spark"
      aria-hidden="true">
      {Array.from(values.entries(), ([position, value]) => (
        <i
          key={position}
          style={{
            height: `${(value / max) * 100}%`,
            background: highlight.includes(position) ? tone.done : tone.todo,
          }}
        />
      ))}
    </div>
  );
}

export function Workload({ rows }: { rows: { name: string; pct: number; label: string }[] }) {
  return (
    <div className="tl-workload">
      {rows.map((row) => (
        <div
          key={row.name}
          className="tl-workload__row">
          <span className="tl-workload__name">{row.name}</span>
          <span className="tl-workload__track">
            <i
              style={{
                width: `${Math.min(row.pct, 100)}%`,
                background: row.pct > 100 ? "var(--color-accent-2-500)" : "var(--color-accent-500)",
              }}
            />
          </span>
          <span className="tl-workload__label">{row.label}</span>
        </div>
      ))}
    </div>
  );
}

export type TimelineRow = {
  name: string;
  icon?: ReactNode;
  start: number;
  end: number;
  tone?: "accent" | "accent-2" | "ghost";
  milestone?: number;
};

export function Timeline({
  quarters,
  rows,
  today,
}: {
  quarters: string[];
  rows: TimelineRow[];
  today?: number;
}) {
  const lane = `linear-gradient(to right, var(--color-hair) 0 1px, transparent 1px) 0 0 / ${100 / quarters.length}% 100% repeat-x`;
  return (
    <div className="tl-timeline">
      <div className="tl-timeline__names">
        <div className="tl-timeline__head">Project</div>
        {rows.map((row) => (
          <div
            key={row.name}
            className="tl-timeline__name">
            {row.icon}
            <span>{row.name}</span>
          </div>
        ))}
      </div>
      <div className="tl-timeline__track">
        <div className="tl-timeline__quarters">
          {quarters.map((quarter) => (
            <div
              key={quarter}
              className="tl-timeline__q">
              {quarter}
            </div>
          ))}
        </div>
        {rows.map((row) => (
          <div
            key={row.name}
            className="tl-timeline__lane"
            style={{ background: lane }}>
            <div
              className={cx("tl-timeline__bar", `tl-timeline__bar--${row.tone ?? "accent"}`)}
              style={{ left: `${row.start}%`, width: `${row.end - row.start}%` }}>
              {row.name}
            </div>
            {row.milestone != null && (
              <span
                className="tl-timeline__milestone"
                style={{ left: `${row.milestone}%` }}
              />
            )}
          </div>
        ))}
        {today != null && (
          <span
            className="tl-timeline__today"
            style={{ left: `${today}%` }}
          />
        )}
      </div>
    </div>
  );
}