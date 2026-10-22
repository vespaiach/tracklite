import { expect, it } from "vitest";
import { mayDeleteComment, parentOf } from "./rules";

it("REQ-034.1, REQ-034.2, REQ-034.3: a comment may be deleted by its author or an admin, not by another member", () => {
  expect(mayDeleteComment({ id: "sam", role: "member" }, "sam")).toBe(true);
  expect(mayDeleteComment({ id: "admin", role: "admin" }, "sam")).toBe(true);
  expect(mayDeleteComment({ id: "alex", role: "member" }, "sam")).toBe(false);
});

it("a comment belongs to its issue, or else to its project", () => {
  expect(parentOf({ issueId: "i1", projectId: null })).toEqual({ issueId: "i1" });
  expect(parentOf({ issueId: null, projectId: "p1" })).toEqual({ projectId: "p1" });
});