import { Avatar, AvatarStack, Pill } from "../components/ui/track-lite";
import type { IssueLabel, MemberSummary } from "./api";
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

export function memberName(member: MemberSummary) {
  return member.deactivated ? `${member.fullName} (deactivated)` : member.fullName;
}

export function assignedTo(assignees: MemberSummary[]) {
  return assignees.length > 0 ? `assigned to ${assignees.map(memberName).join(", ")}` : "unassigned";
}

export function Assignees({ assignees, me }: { assignees: MemberSummary[]; me?: string }) {
  return (
    <span className="tl-list-row__end">
      {assignees.length > 0 ? (
        <AvatarStack
          members={assignees}
          me={me}
        />
      ) : (
        <Avatar
          empty
          title="Unassigned"
        />
      )}
    </span>
  );
}