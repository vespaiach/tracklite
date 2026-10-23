import { Pill } from "../components/ui/track-lite";
import type { IssueLabel } from "./api";
import { formatExact, formatUpdated } from "./dates";

const labelsShown = 2;

export function LabelPills({
  labels,
  className = "tl-table__cell",
}: {
  labels: IssueLabel[];
  className?: string;
}) {
  const hidden = labels.slice(labelsShown);
  return (
    <span className={className}>
      {labels.slice(0, labelsShown).map((label) => (
        <Pill
          key={label.id}
          kind="label">
          {label.name}
        </Pill>
      ))}
      {hidden.length > 0 && (
        <Pill
          kind="est"
          title={hidden.map((label) => label.name).join(", ")}>
          {`+${hidden.length}`}
        </Pill>
      )}
    </span>
  );
}

export function UpdatedAt({ at }: { at: string }) {
  return (
    <time
      dateTime={at}
      className="tl-list-date"
      title={`Updated ${formatExact(at)}`}>
      {formatUpdated(at)}
    </time>
  );
}