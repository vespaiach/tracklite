import { generateKeyBetween } from "fractional-indexing";
import type { IssuePriority, IssueStatus } from "../../contract";
import type { Member, Username } from "../identity";
import type { IssueChange } from "./schemas";

type IssueFields = { title: string; status: IssueStatus; priority: IssuePriority };

export type IssueEdit =
  | { field: "title"; title: string }
  | { field: "status"; status: IssueStatus }
  | { field: "priority"; priority: IssuePriority }
  | { field: "assignee"; assignee: Username | null }
  | { field: "labels"; labelIds: string[] }
  | { field: "none" };

const noEdit: IssueEdit = { field: "none" };

export function positionBetween(before: string | null, after: string | null) {
  return generateKeyBetween(before, after);
}

export function descriptionSaveOf({ description, descriptionVersion }: IssueChange) {
  if (description === undefined || descriptionVersion === undefined) return undefined;
  return { description, descriptionVersion };
}

export function editOf(
  issue: IssueFields,
  { title, status, priority, assignee, labelIds }: IssueChange,
): IssueEdit {
  if (title !== undefined) return title === issue.title ? noEdit : { field: "title", title };
  if (status !== undefined) return status === issue.status ? noEdit : { field: "status", status };
  if (priority !== undefined) return priority === issue.priority ? noEdit : { field: "priority", priority };
  if (assignee !== undefined) return { field: "assignee", assignee };
  if (labelIds !== undefined) return { field: "labels", labelIds };
  return noEdit;
}

export function sameLabels(current: string[], next: string[]) {
  return current.length === next.length && current.every((labelId) => next.includes(labelId));
}

export function mayDeleteIssue(actor: Pick<Member, "id" | "role">, createdBy: string) {
  return createdBy === actor.id || actor.role === "admin";
}