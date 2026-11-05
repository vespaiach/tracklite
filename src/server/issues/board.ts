import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../shared/db";
import { publishAll } from "../shared/events";
import type { Member } from "../identity";
import { issues } from "./tables";
import type { ProjectKey } from "../projects";
import { type Board, type BoardIssue, type IssueStatus, issueStatuses } from "../../contract";
import type { IssueId, IssueMove } from "./schemas";
import {
  assigneesFor,
  assigneesOf,
  labelsFor,
  labelsOf,
  readableProject,
  recentlyClosedOrOpen,
  updatedIssue,
} from "./rows";
import { move } from "./model";
import { loadIssue, neighboursAt, saveIssue } from "./repository";

export async function moveIssue(_actor: Member, id: IssueId | undefined, { status, place }: IssueMove) {
  return db.transaction(async (tx) => {
    const before = await loadIssue(tx, id);

    const { issue, events } = move(before, status, await neighboursAt(tx, before, status, place));

    await saveIssue(tx, before, issue);

    await publishAll(tx, events);

    return updatedIssue(tx, issue.id);
  });
}

export async function getBoard(_actor: Member, projectKey: ProjectKey | undefined): Promise<Board> {
  const project = await readableProject(projectKey);

  const rows = await boardRows(project.id);

  const labelRows = await labelsOf(rows.map((row) => row.issueId));

  const assigneeRows = await assigneesOf(
    db,
    rows.map((row) => row.issueId),
  );

  const cards = rows.map((row): { status: IssueStatus; card: BoardIssue } => ({
    status: row.status,
    card: {
      id: `${project.key}-${row.number}`,
      title: row.title,
      priority: row.priority,
      assignees: assigneesFor(assigneeRows, row.issueId),
      labels: labelsFor(labelRows, row.issueId),
    },
  }));

  return issueStatuses.map((status) => {
    const column = cards.filter((entry) => entry.status === status).map((entry) => entry.card);
    return { status, count: column.length, cards: column };
  });
}

function boardRows(projectId: string) {
  return db
    .select({
      issueId: issues.id,
      number: issues.number,
      title: issues.title,
      status: issues.status,
      priority: issues.priority,
    })
    .from(issues)
    .where(and(eq(issues.projectId, projectId), recentlyClosedOrOpen()))
    .orderBy(asc(issues.status), asc(issues.position), asc(issues.id));
}