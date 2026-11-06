import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../infrastructure/db";
import { publishAll } from "../../../infrastructure/events";
import type { Member } from "../../identity";
import { takeIssueNumber, writableProject } from "../../projects";
import { issues } from "../../../infrastructure/issues/tables";
import type { NewIssue } from "../schemas";
import { findIssue, updatedIssue } from "../../../queries";
import { newIssue } from "../model";
import { assigneeCandidates, firstPositionIn, saveIssue } from "../repository";
import type { ProjectKey } from "../../../domain/shared/identifiers";

export async function createIssue(
  actor: Member,
  projectKey: ProjectKey | undefined,
  { requestId, title, status, assignees }: NewIssue,
) {
  return db.transaction(async (tx) => {
    const project = await writableProject(tx, projectKey, "update");

    const repeated = await findIssue(tx, eq(issues.requestId, requestId.value));
    if (repeated) return { issue: repeated, created: false };

    const number = await takeIssueNumber(tx, project.id);

    const firstInColumn = await firstPositionIn(tx, project.id, status);

    const candidates = await assigneeCandidates(tx, assignees);

    const { issue, events } = newIssue(
      actor,
      { id: randomUUID(), projectId: project.id, number, requestId: requestId.value, title, status },
      firstInColumn,
      assignees,
      candidates,
    );

    await saveIssue(tx, null, issue);

    await publishAll(tx, events);

    return { issue: await updatedIssue(tx, issue.id), created: true };
  });
}