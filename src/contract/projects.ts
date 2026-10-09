import type { MemberSummary } from "./members";

export type ProjectSummary = { key: string; name: string; archivedAt: string | null };

export type Project = ProjectSummary & {
  description: string;
  descriptionVersion: number;
  mentions: MemberSummary[];
};

export type LabelColor = "gray" | "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink";

export type Label = { id: string; name: string; color: LabelColor; issueCount: number };