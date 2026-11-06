import { expect, it } from "vitest";
import { RequestId } from "../shared/identifiers";
import { Comment, parentOf } from "./comment";

function samsComment() {
  return Comment.create(
    { id: "sam" },
    { target: { issueId: "i1" }, body: "Hi", requestId: RequestId.from(crypto.randomUUID()) },
  );
}

it("REQ-034.1, REQ-034.2, REQ-034.3: a comment may be deleted by its author or an admin, not by another member", () => {
  const comment = samsComment();

  expect(() => comment.assertDeletableBy({ id: "sam", role: "member" })).not.toThrow();
  expect(() => comment.assertDeletableBy({ id: "admin", role: "admin" })).not.toThrow();
  expect(() => comment.assertDeletableBy({ id: "alex", role: "member" })).toThrow(
    expect.objectContaining({ kind: "forbidden" }),
  );
});

it("a comment belongs to its issue, or else to its project", () => {
  expect(parentOf({ issueId: "i1", projectId: null })).toEqual({ issueId: "i1" });
  expect(parentOf({ issueId: null, projectId: "p1" })).toEqual({ projectId: "p1" });
});