import { expect, it } from "vitest";
import type { Username } from "../identity";
import { descriptionSaveOf, editOf, mayDeleteIssue, positionBetween, sameLabels } from "./rules";

const issue = { title: "Fix login", status: "backlog", priority: "none" } as const;

it("REQ-027.1, REQ-026.1: a position sorts between its neighbours, above the first card and below the last", () => {
  const top = positionBetween(null, "a1");
  const middle = positionBetween("a1", "a2");
  const bottom = positionBetween("a2", null);

  expect(top < "a1").toBe(true);
  expect("a1" < middle && middle < "a2").toBe(true);
  expect(bottom > "a2").toBe(true);
});

it("§3.3: a save with both description and version is a description save; anything else is a field edit", () => {
  expect(descriptionSaveOf({ description: "Hi", descriptionVersion: 2 })).toEqual({
    description: "Hi",
    descriptionVersion: 2,
  });
  expect(descriptionSaveOf({ title: "Hi" })).toBeUndefined();
});

it("REQ-016.3, REQ-017, REQ-018.1: saving the title, status or priority an issue already has changes nothing; a new value is an edit of that field", () => {
  expect(editOf(issue, { title: "Fix login" })).toEqual({ field: "none" });
  expect(editOf(issue, { status: "backlog" })).toEqual({ field: "none" });
  expect(editOf(issue, { priority: "none" })).toEqual({ field: "none" });

  expect(editOf(issue, { title: "Fix logout" })).toEqual({ field: "title", title: "Fix logout" });
  expect(editOf(issue, { status: "done" })).toEqual({ field: "status", status: "done" });
  expect(editOf(issue, { priority: "urgent" })).toEqual({ field: "priority", priority: "urgent" });
});

it("REQ-019.1, REQ-019.2, REQ-020.1: an assignee or label save is passed on as an edit of that field", () => {
  expect(editOf(issue, { assignee: "alex" as Username })).toEqual({ field: "assignee", assignee: "alex" });
  expect(editOf(issue, { assignee: null })).toEqual({ field: "assignee", assignee: null });
  expect(editOf(issue, { labelIds: ["l1"] })).toEqual({ field: "labels", labelIds: ["l1"] });
});

it("REQ-020: the same labels in any order are no change; an added or removed label is", () => {
  expect(sameLabels(["a", "b"], ["b", "a"])).toBe(true);
  expect(sameLabels(["a"], ["a", "b"])).toBe(false);
  expect(sameLabels(["a", "b"], ["a"])).toBe(false);
});

it("REQ-023.1, REQ-023.2: the creator or an admin may delete an issue; another member may not", () => {
  expect(mayDeleteIssue({ id: "sam", role: "member" }, "sam")).toBe(true);
  expect(mayDeleteIssue({ id: "admin", role: "admin" }, "sam")).toBe(true);
  expect(mayDeleteIssue({ id: "alex", role: "member" }, "sam")).toBe(false);
});