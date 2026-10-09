import type { PriorityKind, StatusKind } from "../components/ui/track-lite";
import type { IssuePriority, IssueStatus } from "../contract";

export const statuses = {
  backlog: { name: "Backlog", kind: "backlog" },
  in_progress: { name: "In Progress", kind: "progress" },
  in_review: { name: "In Review", kind: "review" },
  done: { name: "Done", kind: "done" },
  canceled: { name: "Canceled", kind: "canceled" },
} satisfies Record<IssueStatus, { name: string; kind: StatusKind }>;

export const priorities = {
  urgent: { name: "Urgent", kind: "urgent" },
  high: { name: "High", kind: "high" },
  medium: { name: "Medium", kind: "med" },
  low: { name: "Low", kind: "low" },
  none: { name: "No priority", kind: "none" },
} satisfies Record<IssuePriority, { name: string; kind: PriorityKind }>;