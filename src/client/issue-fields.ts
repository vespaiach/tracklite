import type { PriorityKind, StatusKind } from "../components/ui/track-lite";
import type { IssuePriority, IssueStatus } from "./api";

export const statuses: [IssueStatus, string, StatusKind][] = [
  ["backlog", "Backlog", "backlog"],
  ["in_progress", "In Progress", "progress"],
  ["in_review", "In Review", "review"],
  ["done", "Done", "done"],
  ["canceled", "Canceled", "canceled"],
];

export const priorities: [IssuePriority, string, PriorityKind][] = [
  ["none", "No priority", "none"],
  ["urgent", "Urgent", "urgent"],
  ["high", "High", "high"],
  ["medium", "Medium", "med"],
  ["low", "Low", "low"],
];