import "server-only";
import { eq, sql } from "drizzle-orm";
import { DomainError } from "../../domain/shared/domain-error";
import type { Executor, Transaction } from "../../infrastructure/transaction";
import { issues } from "../../infrastructure/issues/tables";
import { writableProject } from "../../infrastructure/projects/drizzle-project-repository";
import { projects } from "../../infrastructure/projects/tables";
import { findComments } from "../../queries";
import { comments } from "../../infrastructure/comments/tables";
import { type Comment, parentOf } from "./model";
import { ProjectKey, type Uuid } from "../../domain/shared/identifiers";

export function commentGone() {
  return new DomainError("notFound", "This comment was deleted");
}

export function toComment(row: typeof comments.$inferSelect): Comment {
  return {
    id: row.id,
    target: parentOf(row),
    authorId: row.authorId,
    body: row.body,
    version: row.version,
    requestId: row.requestId,
  };
}

export async function loadComment(tx: Transaction, id: Uuid | undefined) {
  if (id === undefined) throw commentGone();

  const [target] = await tx
    .select({ id: comments.id, projectKey: projects.key })
    .from(comments)
    .leftJoin(issues, eq(issues.id, comments.issueId))
    .innerJoin(projects, eq(projects.id, sql`coalesce(${comments.projectId}, ${issues.projectId})`))
    .where(eq(comments.id, id.value));
  if (!target) throw commentGone();

  await writableProject(tx, ProjectKey.from(target.projectKey));

  const [row] = await tx.select().from(comments).where(eq(comments.id, target.id)).for("update");
  if (!row) throw commentGone();
  return toComment(row);
}

export async function saveComment(tx: Transaction, before: Comment | null, after: Comment) {
  if (!before) return insertComment(tx, after);
  if (before.version === after.version) return;

  await tx
    .update(comments)
    .set({ body: after.body, version: after.version, editedAt: sql`now()` })
    .where(eq(comments.id, after.id));
}

async function insertComment(tx: Transaction, { target, ...comment }: Comment) {
  await tx.insert(comments).values({ ...comment, ...target });
}

export async function deleteCommentRow(tx: Transaction, comment: Comment) {
  await tx.delete(comments).where(eq(comments.id, comment.id));
}

export async function oneComment(executor: Executor, id: string) {
  const [comment] = await findComments(executor, eq(comments.id, id));
  if (!comment) throw commentGone();
  return comment;
}