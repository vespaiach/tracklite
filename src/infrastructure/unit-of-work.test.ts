import { eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { AggregateRoot } from "../domain/shared/aggregate-root";
import { createIssue, createMember, createProject } from "../test/factories";
import { db } from "./db";
import { issues } from "./issues/tables";
import { outboxEvents } from "./notifications/tables";
import { type TransactionScope, unitOfWork } from "./unit-of-work";

class TestIssue extends AggregateRoot {
  readonly id: string;
  title: string;

  constructor(id: string, title: string) {
    super();
    this.id = id;
    this.title = title;
  }

  retitleAndAssign(actorId: string, title: string, assigneeId: string) {
    this.title = title;
    this.record({ type: "IssueAssigned", actorId, issueId: this.id, assigneeIds: [assigneeId] });
  }
}

function testIssueRepository({ tx, saved }: TransactionScope) {
  return {
    async save(issue: TestIssue) {
      await tx.update(issues).set({ title: issue.title }).where(eq(issues.id, issue.id));
      saved(issue);
    },
  };
}

const work = unitOfWork((scope) => ({ issues: testIssueRepository(scope) }));

async function assignedIssue() {
  const [actor, assignee, project] = await Promise.all([createMember(), createMember(), createProject()]);
  const row = await createIssue(project.id);
  const issue = new TestIssue(row.id, row.title);
  issue.retitleAndAssign(actor.id, "Renamed", assignee.id);
  return { issue, assignee, originalTitle: row.title };
}

async function stored(issue: TestIssue, assigneeId: string) {
  const [row] = await db.select({ title: issues.title }).from(issues).where(eq(issues.id, issue.id));
  const events = await db.$count(
    outboxEvents,
    sql`${outboxEvents.payload} @> ${JSON.stringify({ recipientIds: [assigneeId] })}::jsonb`,
  );
  return { title: row.title, events };
}

it("D-62: a committed unit of work saves the aggregate and writes its event to the outbox, and pullEvents hands events over once", async () => {
  const { issue, assignee } = await assignedIssue();

  await work.run(({ issues }) => issues.save(issue));

  expect(await stored(issue, assignee.id)).toEqual({ title: "Renamed", events: 1 });
  expect(issue.pullEvents()).toEqual([]);
});

it("D-62: a thrown error rolls back the aggregate's row and its outbox event together", async () => {
  const { issue, assignee, originalTitle } = await assignedIssue();

  const failing = work.run(async ({ issues }) => {
    await issues.save(issue);
    throw new Error("after save");
  });

  await expect(failing).rejects.toThrow("after save");
  expect(await stored(issue, assignee.id)).toEqual({ title: originalTitle, events: 0 });
});