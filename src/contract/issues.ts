import type { MemberSummary } from "./members";
import type { Label } from "./projects";

export type IssueStatus = "backlog" | "in_progress" | "in_review" | "done" | "canceled";

export type IssuePriority = "none" | "urgent" | "high" | "medium" | "low";

export type IssueLabel = Pick<Label, "id" | "name" | "color">;

export type Issue = {
  id: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignee: MemberSummary | null;
  createdBy: MemberSummary;
  createdAt: string;
  updatedAt: string;
  labels: IssueLabel[];
  descriptionVersion: number;
  mentions: MemberSummary[];
  archived: boolean;
};

export type BoardIssue = Pick<Issue, "id" | "title" | "priority" | "assignee" | "labels">;

export type BoardStatusColumn = { status: IssueStatus; count: number; cards: BoardIssue[] };

export type Board = BoardStatusColumn[];

export type ListIssue = Pick<
  Issue,
  "id" | "title" | "status" | "priority" | "assignee" | "labels" | "updatedAt"
>;

export type IssueListPage = { issues: ListIssue[]; hasMore: boolean; deactivatedAssignees: MemberSummary[] };

export type MyIssue = Pick<Issue, "id" | "title" | "priority" | "labels" | "updatedAt"> & {
  projectName: string;
};

export type MyIssueGroup = { status: IssueStatus; count: number; issues: MyIssue[] };