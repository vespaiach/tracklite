import type { IssueStatus } from "./issues";
import type { MemberSummary } from "./members";

export type ProjectSummary = { key: string; name: string; archivedAt: string | null };

export type Project = ProjectSummary & {
  description: string;
  descriptionVersion: number;
  mentions: MemberSummary[];
  issueCounts: Record<IssueStatus, number>;
  createdAt: string;
  createdBy: MemberSummary | null;
};

export const labelColors = ["gray", "red", "orange", "yellow", "green", "blue", "purple", "pink"] as const;

export type LabelColor = (typeof labelColors)[number];

export type Label = { id: string; name: string; color: LabelColor; issueCount: number };