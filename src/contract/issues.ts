import type { MemberSummary } from "./members";
import type { Label } from "./projects";

export const issueStatuses = ["backlog", "in_progress", "in_review", "done", "canceled"] as const;

export type IssueStatus = (typeof issueStatuses)[number];

export const issuePriorities = ["urgent", "high", "medium", "low", "none"] as const;

export type IssuePriority = (typeof issuePriorities)[number];

export type IssueLabel = Pick<Label, "id" | "name" | "color">;

export type Issue = {
  id: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignees: MemberSummary[];
  createdBy: MemberSummary;
  createdAt: string;
  updatedAt: string;
  labels: IssueLabel[];
  descriptionVersion: number;
  mentions: MemberSummary[];
  archived: boolean;
};

export type BoardIssue = Pick<Issue, "id" | "title" | "priority" | "assignees" | "labels">;

export type BoardStatusColumn = { status: IssueStatus; count: number; cards: BoardIssue[] };

export type Board = BoardStatusColumn[];

export type BoardPlace = "top" | "bottom" | { after: string };

export type BoardMove = { id: string; status: IssueStatus; place: BoardPlace };

export type IssueDraft = {
  key: string;
  requestId: string;
  title: string;
  status?: IssueStatus;
  assignees: string[];
};

export type ListIssue = Pick<
  Issue,
  "id" | "title" | "status" | "priority" | "assignees" | "labels" | "updatedAt"
>;

export type IssueListPage = { issues: ListIssue[]; hasMore: boolean; deactivatedAssignees: MemberSummary[] };

export type MyIssue = Pick<Issue, "id" | "title" | "priority" | "assignees" | "labels" | "updatedAt"> & {
  projectName: string;
};

export type MyIssueGroup = { status: IssueStatus; count: number; issues: MyIssue[] };