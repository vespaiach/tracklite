import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "../shared/db";
import type { Transaction } from "../shared/transaction";
import type { Member } from "../identity";
import { writableProject } from "../projects";
import { issues, projects } from "../shared/schema";
import type { NewIssue } from "./schemas";
import { findIssue, topOfColumn } from "./rows";

export async function createIssue(actor: Member, projectKey: string, { requestId, title, status }: NewIssue) {
  return db.transaction(async (tx) => {
    const project = await writableProject(tx, projectKey, "update");

    const repeated = await findIssue(tx, eq(issues.requestId, requestId));
    if (repeated) return { issue: repeated, created: false };

    const number = await takeIssueNumber(tx, project.id);

    const position = await topOfColumn(tx, project.id, status);

    const [inserted] = await tx
      .insert(issues)
      .values({
        projectId: project.id,
        number,
        title,
        status,
        priority: "none",
        position,
        createdBy: actor.id,
        requestId,
      })
      .returning({ id: issues.id });

    const issue = await findIssue(tx, eq(issues.id, inserted.id));
    if (!issue) throw new Error("Created issue not found");

    return { issue, created: true };
  });
}

async function takeIssueNumber(tx: Transaction, projectId: string) {
  const [{ number }] = await tx
    .update(projects)
    .set({ nextIssueNumber: sql`${projects.nextIssueNumber} + 1` })
    .where(eq(projects.id, projectId))
    .returning({ number: sql<number>`${projects.nextIssueNumber} - 1` });
  return number;
}