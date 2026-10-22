import "server-only";
import { and, asc, desc, eq, gt, ne, type SQL, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "../shared/db";
import type { Transaction } from "../shared/transaction";
import { type Member, memberSummary } from "../identity";
import { issues } from "./tables";
import { type ProjectKey, projects } from "../projects";
import { type Board, type BoardIssue, type IssueStatus, issueStatuses } from "../../contract";
import type { IssueId, IssueMove } from "./schemas";
import {
  assignees,
  byIssueId,
  type IssueUpdate,
  issueGone,
  labelsFor,
  labelsOf,
  lockedIssue,
  readableProject,
  recentlyClosedOrOpen,
  updatedIssue,
} from "./rows";

async function positionIn(
  tx: Transaction,
  issue: typeof issues.$inferSelect,
  status: IssueStatus,
  place: IssueMove["place"],
) {
  const otherCards = and(
    eq(issues.projectId, issue.projectId),
    eq(issues.status, status),
    ne(issues.id, issue.id),
  );

  if (place === "bottom") return bottomOf(tx, otherCards);

  const afterPosition = place === "top" ? null : await positionOf(tx, otherCards, place.after);

  const nextPosition = await firstPositionAfter(tx, otherCards, afterPosition);

  return generateKeyBetween(afterPosition, nextPosition);
}

async function bottomOf(tx: Transaction, cards: SQL | undefined) {
  const [last] = await tx
    .select({ position: issues.position })
    .from(issues)
    .where(cards)
    .orderBy(desc(issues.position), desc(issues.id))
    .limit(1);
  return generateKeyBetween(last?.position ?? null, null);
}

async function positionOf(tx: Transaction, cards: SQL | undefined, id: IssueId | undefined) {
  const where = byIssueId(id);
  if (!where) return null;
  const [card] = await tx
    .select({ position: issues.position })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .where(and(cards, where));
  return card?.position ?? null;
}

async function firstPositionAfter(tx: Transaction, cards: SQL | undefined, position: string | null) {
  const [next] = await tx
    .select({ position: issues.position })
    .from(issues)
    .where(position === null ? cards : and(cards, gt(issues.position, position)))
    .orderBy(asc(issues.position), asc(issues.id))
    .limit(1);
  return next?.position ?? null;
}

export async function moveIssue(_actor: Member, id: IssueId | undefined, { status, place }: IssueMove) {
  const where = byIssueId(id);
  if (!where) throw issueGone();

  return db.transaction(async (tx) => {
    const issue = await lockedIssue(tx, where);

    const position = await positionIn(tx, issue, status, place);

    const statusChange: IssueUpdate =
      status === issue.status ? {} : { status, statusChangedAt: sql`now()`, updatedAt: sql`now()` };

    await tx
      .update(issues)
      .set({ position, ...statusChange })
      .where(eq(issues.id, issue.id));

    return updatedIssue(tx, issue.id);
  });
}

export async function getBoard(_actor: Member, projectKey: ProjectKey | undefined): Promise<Board> {
  const project = await readableProject(projectKey);

  const rows = await boardRows(project.id);

  const labelRows = await labelsOf(rows.map((row) => row.issueId));

  const cards = rows.map((row): { status: IssueStatus; card: BoardIssue } => ({
    status: row.status,
    card: {
      id: `${project.key}-${row.number}`,
      title: row.title,
      priority: row.priority,
      assignee: row.assignee ? memberSummary(row.assignee) : null,
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
      assignee: {
        username: assignees.username,
        fullName: assignees.fullName,
        deactivatedAt: assignees.deactivatedAt,
      },
    })
    .from(issues)
    .leftJoin(assignees, eq(assignees.id, issues.assigneeId))
    .where(and(eq(issues.projectId, projectId), recentlyClosedOrOpen()))
    .orderBy(asc(issues.status), asc(issues.position), asc(issues.id));
}