import "server-only";
import { asc, eq, inArray, type SQL } from "drizzle-orm";
import { DomainError } from "../domain/shared/domain-error";
import { db } from "../infrastructure/db";
import type { Executor } from "../infrastructure/transaction";
import { memberSummary } from "../domain/identity/member-summary";
import { type Member, members } from "../infrastructure/identity/tables";
import { comments } from "../infrastructure/comments/tables";
import { issues } from "../infrastructure/issues/tables";
import type { IssueId } from "../domain/shared/identifiers";
import { projects } from "../infrastructure/projects/tables";
import type { ProjectKey } from "../domain/shared/identifiers";
import { mentions } from "../infrastructure/notifications/tables";
import type { ThreadComment } from "../contract";
import { byIssueId } from "./issue";
import { byProjectKey } from "./project";

export async function findComments(executor: Executor, where: SQL): Promise<ThreadComment[]> {
  const rows = await commentRows(executor, where);

  const mentioned = await mentionsOfComments(
    executor,
    rows.map((row) => row.id),
  );

  return rows.map(
    (row): ThreadComment => ({
      id: row.id,
      body: row.body,
      author: memberSummary(row.author),
      createdAt: row.createdAt.toISOString(),
      editedAt: row.editedAt?.toISOString() ?? null,
      version: row.version,
      mentions: mentioned.filter((mention) => mention.commentId === row.id).map(memberSummary),
    }),
  );
}

function commentRows(executor: Executor, where: SQL) {
  return executor
    .select({
      id: comments.id,
      body: comments.body,
      version: comments.version,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
      author: {
        username: members.username,
        fullName: members.fullName,
        deactivatedAt: members.deactivatedAt,
      },
    })
    .from(comments)
    .innerJoin(members, eq(members.id, comments.authorId))
    .where(where)
    .orderBy(asc(comments.createdAt), asc(comments.id));
}

async function mentionsOfComments(executor: Executor, commentIds: string[]) {
  if (commentIds.length === 0) return [];
  return executor
    .select({
      commentId: mentions.commentId,
      username: members.username,
      fullName: members.fullName,
      deactivatedAt: members.deactivatedAt,
    })
    .from(mentions)
    .innerJoin(members, eq(members.id, mentions.memberId))
    .where(inArray(mentions.commentId, commentIds))
    .orderBy(asc(members.username));
}

export async function issueTarget(executor: Executor, id: IssueId | undefined) {
  const where = byIssueId(id);
  if (!where) return undefined;
  const [issue] = await executor
    .select({ id: issues.id, projectKey: projects.key })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .where(where);
  return issue;
}

export async function listIssueComments(_actor: Member, id: IssueId | undefined) {
  const issue = await issueTarget(db, id);
  if (!issue) throw new DomainError("notFound", "Not found");
  return findComments(db, eq(comments.issueId, issue.id));
}

export async function listProjectComments(_actor: Member, key: ProjectKey | undefined) {
  const [project] = await db.select({ id: projects.id }).from(projects).where(byProjectKey(key));
  if (!project) throw new DomainError("notFound", "Not found");
  return findComments(db, eq(comments.projectId, project.id));
}