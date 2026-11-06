import type { Username } from "../shared/identifiers";
import type { IssuePriority } from "./issue-priority";
import type { IssueStatus } from "./issue-status";
import type { IssueTitle } from "./issue-title";

export type IssueChange = {
  title?: IssueTitle;
  status?: IssueStatus;
  priority?: IssuePriority;
  assignees?: Username[];
  labelIds?: string[];
  description?: string;
  descriptionVersion?: number;
};

export type IssueEdit =
  | { field: "description"; description: string; descriptionVersion: number }
  | { field: "title"; title: IssueTitle }
  | { field: "status"; status: IssueStatus }
  | { field: "priority"; priority: IssuePriority }
  | { field: "assignees"; assignees: Username[] }
  | { field: "labels"; labelIds: string[] }
  | { field: "none" };

export function editOf({
  title,
  status,
  priority,
  assignees,
  labelIds,
  description,
  descriptionVersion,
}: IssueChange): IssueEdit {
  if (description !== undefined && descriptionVersion !== undefined) {
    return { field: "description", description, descriptionVersion };
  }
  if (title !== undefined) return { field: "title", title };
  if (status !== undefined) return { field: "status", status };
  if (priority !== undefined) return { field: "priority", priority };
  if (assignees !== undefined) return { field: "assignees", assignees };
  if (labelIds !== undefined) return { field: "labels", labelIds };
  return { field: "none" };
}