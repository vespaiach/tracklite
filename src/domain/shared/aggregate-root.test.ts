import { expect, it } from "vitest";
import { AggregateRoot } from "./aggregate-root";
import type { DomainEvent } from "./events";

class Assignment extends AggregateRoot {
  assign(assigneeId: string) {
    this.record({ type: "IssueAssigned", actorId: "actor", issueId: "issue", assigneeIds: [assigneeId] });
  }
}

it("D-61: pullEvents hands recorded events over once, in order", () => {
  const assignment = new Assignment();
  assignment.assign("sam");
  assignment.assign("alex");

  expect(
    assignment.pullEvents().map((event: DomainEvent) => event.type === "IssueAssigned" && event.assigneeIds),
  ).toEqual([["sam"], ["alex"]]);
  expect(assignment.pullEvents()).toEqual([]);
});