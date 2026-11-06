import { generateKeyBetween } from "fractional-indexing";
import type { IssuePriority, IssueStatus } from "../../contract";
import { DomainError } from "../../domain/shared/domain-error";
import type { DomainEvent } from "../../domain/shared/events";
import type { Member } from "../identity";
import type { IssueChange } from "./schemas";
import type { Username } from "../../domain/shared/identifiers";

export type Issue = Readonly<{
  id: string;
  projectId: string;
  number: number;
  requestId: string;
  title: string;
  description: string;
  descriptionVersion: number;
  descriptionEditedBy: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  position: string;
  createdBy: string;
  assigneeIds: readonly string[];
  labelIds: readonly string[];
}>;

export type IssueChangeResult = { issue: Issue; events: DomainEvent[] };

export type AssigneeCandidate = { id: string; username: string; deactivated: boolean };

export type Neighbours = { before: string | null; after: string | null };

export type IssueEdit =
  | { field: "title"; title: string }
  | { field: "status"; status: IssueStatus }
  | { field: "priority"; priority: IssuePriority }
  | { field: "assignees"; assignees: Username[] }
  | { field: "labels"; labelIds: string[] }
  | { field: "none" };

type IssueFields = Pick<Issue, "title" | "status" | "priority">;

type NewIssueFields = Pick<Issue, "id" | "projectId" | "number" | "requestId" | "title" | "status">;

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
  { title, status, priority, assignees, labelIds }: IssueChange,
): IssueEdit {
  if (title !== undefined) return title === issue.title ? noEdit : { field: "title", title };
  if (status !== undefined) return status === issue.status ? noEdit : { field: "status", status };
  if (priority !== undefined) return priority === issue.priority ? noEdit : { field: "priority", priority };
  if (assignees !== undefined) return { field: "assignees", assignees };
  if (labelIds !== undefined) return { field: "labels", labelIds };
  return noEdit;
}

export function sameLabels(current: readonly string[], next: readonly string[]) {
  return current.length === next.length && current.every((labelId) => next.includes(labelId));
}

export function mayDeleteIssue(actor: Pick<Member, "id" | "role">, createdBy: string) {
  return createdBy === actor.id || actor.role === "admin";
}

export function assigneeChange(current: readonly string[], next: readonly string[]) {
  return {
    added: next.filter((memberId) => !current.includes(memberId)),
    removed: current.filter((memberId) => !next.includes(memberId)),
  };
}

export function newIssue(
  actor: Pick<Member, "id">,
  fields: NewIssueFields,
  firstInColumn: string | null,
  assignees: Username[],
  candidates: AssigneeCandidate[],
): IssueChangeResult {
  const unassigned: Issue = {
    ...fields,
    description: "",
    descriptionVersion: 0,
    descriptionEditedBy: null,
    priority: "none",
    position: positionBetween(null, firstInColumn),
    createdBy: actor.id,
    assigneeIds: [],
    labelIds: [],
  };

  return assign(unassigned, actor, assignees, candidates);
}

export function retitle(issue: Issue, title: string): IssueChangeResult {
  return { issue: { ...issue, title }, events: [] };
}

export function changeStatus(
  issue: Issue,
  status: IssueStatus,
  firstInColumn: string | null,
): IssueChangeResult {
  return { issue: { ...issue, status, position: positionBetween(null, firstInColumn) }, events: [] };
}

export function changePriority(issue: Issue, priority: IssuePriority): IssueChangeResult {
  return { issue: { ...issue, priority }, events: [] };
}

export function move(issue: Issue, status: IssueStatus, { before, after }: Neighbours): IssueChangeResult {
  return { issue: { ...issue, status, position: positionBetween(before, after) }, events: [] };
}

export function assign(
  issue: Issue,
  actor: Pick<Member, "id">,
  usernames: Username[],
  candidates: AssigneeCandidate[],
): IssueChangeResult {
  const assigneeIds = usernames.map((username) => assigneeIdOf(issue, username, candidates));

  const { added } = assigneeChange(issue.assigneeIds, assigneeIds);

  const events: DomainEvent[] =
    added.length === 0
      ? []
      : [{ type: "IssueAssigned", actorId: actor.id, issueId: issue.id, assigneeIds: added }];
  return { issue: { ...issue, assigneeIds }, events };
}

function assigneeIdOf(issue: Issue, username: Username, candidates: AssigneeCandidate[]) {
  const member = candidates.find((candidate) => candidate.username === username.value);
  if (!member || (member.deactivated && !issue.assigneeIds.includes(member.id))) {
    throw new DomainError("invalid", "Check the highlighted fields", {
      assignees: "Choose an active member",
    });
  }
  return member.id;
}

export function relabel(issue: Issue, labelIds: string[], projectLabelIds: string[]): IssueChangeResult {
  if (projectLabelIds.length !== labelIds.length) {
    throw new DomainError("notFound", "That label no longer exists");
  }

  if (sameLabels(issue.labelIds, labelIds)) return { issue, events: [] };
  return { issue: { ...issue, labelIds }, events: [] };
}

export function saveDescription(
  issue: Issue,
  actor: Pick<Member, "id">,
  description: string,
  descriptionVersion: number,
): IssueChangeResult | { conflictWith: string | null } {
  if (issue.descriptionVersion !== descriptionVersion) return { conflictWith: issue.descriptionEditedBy };

  return {
    issue: {
      ...issue,
      description,
      descriptionVersion: descriptionVersion + 1,
      descriptionEditedBy: actor.id,
    },
    events: [
      { type: "DescriptionSaved", actorId: actor.id, target: { issueId: issue.id }, text: description },
    ],
  };
}