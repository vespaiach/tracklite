import "server-only";
import { eq, sql } from "drizzle-orm";
import { type Comment, type CommentProps, commentGone } from "../../domain/comments/comment";
import type { CommentRepository } from "../../domain/comments/comment-repository";
import { ProjectKey, type RequestId, type Uuid } from "../../domain/shared/identifiers";
import { issues } from "../issues/tables";
import { projects } from "../projects/tables";
import type { Transaction } from "../transaction";
import type { TransactionScope } from "../unit-of-work";
import { toComment, toRow } from "./comment-mapper";
import { comments } from "./tables";

export function drizzleCommentRepository({ tx, saved }: TransactionScope): CommentRepository {
  const loaded = new WeakMap<Comment, Readonly<CommentProps>>();

  return {
    projectKeyOf: (id) => projectKeyOf(tx, id),

    async get(id) {
      const comment = await loadComment(tx, id);
      loaded.set(comment, comment.props);
      return comment;
    },

    idForRequest: (requestId) => idForRequest(tx, requestId),

    async save(comment) {
      const before = loaded.get(comment);
      if (!before) await tx.insert(comments).values(toRow(comment.props));
      else if (before.version !== comment.props.version) await updateBody(tx, comment.props);

      loaded.set(comment, comment.props);
      saved(comment);
    },

    async remove(comment) {
      await tx.delete(comments).where(eq(comments.id, comment.props.id));
    },
  };
}

async function projectKeyOf(tx: Transaction, id: Uuid | undefined) {
  if (id === undefined) throw commentGone();

  const [target] = await tx
    .select({ projectKey: projects.key })
    .from(comments)
    .leftJoin(issues, eq(issues.id, comments.issueId))
    .innerJoin(projects, eq(projects.id, sql`coalesce(${comments.projectId}, ${issues.projectId})`))
    .where(eq(comments.id, id.value));
  if (!target) throw commentGone();

  return ProjectKey.from(target.projectKey);
}

async function loadComment(tx: Transaction, id: Uuid | undefined) {
  if (id === undefined) throw commentGone();

  const [row] = await tx.select().from(comments).where(eq(comments.id, id.value)).for("update");
  if (!row) throw commentGone();

  return toComment(row);
}

async function idForRequest(tx: Transaction, requestId: RequestId) {
  const [repeated] = await tx
    .select({ id: comments.id })
    .from(comments)
    .where(eq(comments.requestId, requestId.value));
  return repeated?.id;
}

async function updateBody(tx: Transaction, { id, body, version }: CommentProps) {
  await tx.update(comments).set({ body, version, editedAt: sql`now()` }).where(eq(comments.id, id));
}