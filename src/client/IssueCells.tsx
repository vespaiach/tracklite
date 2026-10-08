import { type FocusEvent, type MouseEvent, useState } from "react";
import { Link } from "react-router";
import { Pill, TipTrigger } from "../components/ui/track-lite";
import type { IssueLabel } from "./api";
import { formatUpdated } from "./dates";

const labelsShown = 2;

export function TitleLink({ issue }: { issue: { id: string; title: string } }) {
  const [cut, setCut] = useState(false);
  const measure = (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) =>
    setCut(event.currentTarget.scrollWidth > event.currentTarget.clientWidth);
  return (
    <TipTrigger
      tip={issue.title}
      wide
      block
      open={cut ? undefined : false}>
      <Link
        to={`/issue/${issue.id}`}
        onMouseEnter={measure}
        onFocus={measure}
        className="tl-table__link">
        {issue.title}
      </Link>
    </TipTrigger>
  );
}

export function LabelPills({ labels }: { labels: IssueLabel[] }) {
  const hidden = labels.slice(labelsShown);
  return (
    <span className="tl-table__cell">
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
    <span
      className="tl-list-date"
      title={new Date(at).toLocaleString()}>
      {formatUpdated(at)}
    </span>
  );
}