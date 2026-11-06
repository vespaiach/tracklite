import { Issue, type IssueProps } from "../../domain/issues/issue";
import { IssuePriority } from "../../domain/issues/issue-priority";
import { IssueStatus } from "../../domain/issues/issue-status";
import { IssueTitle } from "../../domain/issues/issue-title";
import type { issues } from "./tables";

export type IssueRows = {
  row: typeof issues.$inferSelect;
  assigneeIds: string[];
  labelIds: string[];
};

export function toIssue({ row, assigneeIds, labelIds }: IssueRows) {
  return Issue.rehydrate({
    id: row.id,
    projectId: row.projectId,
    number: row.number,
    requestId: row.requestId,
    title: IssueTitle.from(row.title),
    description: row.description,
    descriptionVersion: row.descriptionVersion,
    descriptionEditedBy: row.descriptionEditedBy,
    status: IssueStatus.from(row.status),
    priority: IssuePriority.from(row.priority),
    position: row.position,
    createdBy: row.createdBy,
    assigneeIds,
    labelIds,
  });
}

export function toRow({ assigneeIds, labelIds, title, status, priority, ...fields }: IssueProps) {
  return { ...fields, title: title.value, status: status.value, priority: priority.value };
}