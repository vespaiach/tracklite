import { expect, it } from "vitest";
import { Username } from "../shared/identifiers";
import { assigneeChange, Issue } from "./issue";
import { editOf } from "./issue-edit";
import { IssuePriority } from "./issue-priority";
import { IssueStatus } from "./issue-status";
import { IssueTitle } from "./issue-title";

function storedIssue(fields: { createdBy?: string; labelIds?: string[] } = {}) {
  return Issue.rehydrate({
    id: "issue-id",
    projectId: "project-id",
    number: 1,
    requestId: "request-id",
    title: IssueTitle.from("Fix login"),
    description: "",
    descriptionVersion: 0,
    descriptionEditedBy: null,
    status: IssueStatus.from("backlog"),
    priority: IssuePriority.from("none"),
    position: "a0",
    createdBy: fields.createdBy ?? "sam",
    assigneeIds: [],
    labelIds: fields.labelIds ?? [],
  });
}

function movedTo(before: string | null, after: string | null) {
  const issue = storedIssue();
  issue.move(IssueStatus.from("done"), { before, after });
  return issue.props.position;
}

it("REQ-027.1, REQ-026.1: a position sorts between its neighbours, above the first card and below the last", () => {
  const top = movedTo(null, "a1");
  const middle = movedTo("a1", "a2");
  const bottom = movedTo("a2", null);

  expect(top < "a1").toBe(true);
  expect("a1" < middle && middle < "a2").toBe(true);
  expect(bottom > "a2").toBe(true);
});

it("§3.3: a save with both description and version is a description save; anything else is a field edit", () => {
  expect(editOf({ description: "Hi", descriptionVersion: 2 })).toEqual({
    field: "description",
    description: "Hi",
    descriptionVersion: 2,
  });
  const title = IssueTitle.from("Hi");
  expect(editOf({ title })).toEqual({ field: "title", title });
});

it("REQ-016.3, REQ-017, REQ-018.1: saving the title, status or priority an issue already has changes nothing; a new value is an edit of that field", () => {
  const issue = storedIssue();
  const unchanged = issue.props;

  issue.retitle(IssueTitle.from("Fix login"));
  issue.changeStatus(IssueStatus.from("backlog"), "a5");
  issue.changePriority(IssuePriority.from("none"));
  expect(issue.props).toBe(unchanged);

  issue.retitle(IssueTitle.from("Fix logout"));
  issue.changeStatus(IssueStatus.from("done"), null);
  issue.changePriority(IssuePriority.from("urgent"));
  expect([issue.props.title.value, issue.props.status.value, issue.props.priority.value]).toEqual([
    "Fix logout",
    "done",
    "urgent",
  ]);
});

it("REQ-019.1, REQ-019.2, REQ-020.1: an assignee or label save is passed on as an edit of that field", () => {
  const alex = Username.from("alex");

  expect(editOf({ assignees: [alex] })).toEqual({ field: "assignees", assignees: [alex] });
  expect(editOf({ assignees: [] })).toEqual({ field: "assignees", assignees: [] });
  expect(editOf({ labelIds: ["l1"] })).toEqual({ field: "labels", labelIds: ["l1"] });
});

it("REQ-020: the same labels in any order are no change; an added or removed label is", () => {
  const issue = storedIssue({ labelIds: ["a", "b"] });
  const unchanged = issue.props;

  issue.relabel(["b", "a"], ["b", "a"]);
  expect(issue.props).toBe(unchanged);

  issue.relabel(["a"], ["a"]);
  expect(issue.props.labelIds).toEqual(["a"]);
  issue.relabel(["a", "b"], ["a", "b"]);
  expect(issue.props.labelIds).toEqual(["a", "b"]);
});

it("REQ-023.1, REQ-023.2: the creator or an admin may delete an issue; another member may not", () => {
  const issue = storedIssue({ createdBy: "sam" });

  expect(() => issue.assertDeletableBy({ id: "sam", role: "member" })).not.toThrow();
  expect(() => issue.assertDeletableBy({ id: "admin", role: "admin" })).not.toThrow();
  expect(() => issue.assertDeletableBy({ id: "alex", role: "member" })).toThrow(
    "You don't have permission to do that.",
  );
});

it("REQ-019.3, REQ-019.4: a new assignee set adds the members not yet assigned and removes the ones left out", () => {
  const current = ["jo-id", "sam-id"];

  expect(assigneeChange(current, ["alex-id", "jo-id"])).toEqual({ added: ["alex-id"], removed: ["sam-id"] });
  expect(assigneeChange(current, ["jo-id", "sam-id"])).toEqual({ added: [], removed: [] });
});