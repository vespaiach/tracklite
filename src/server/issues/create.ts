import "server-only";
import { eq } from "drizzle-orm";
import { db } from "../shared/db";
import type { Member } from "../identity";
import { takeIssueNumber, writableProject } from "../projects";
import { issues } from "./tables";
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