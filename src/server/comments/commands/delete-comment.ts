import "server-only";
import { db } from "../../../infrastructure/db";
import type { Member } from "../../../infrastructure/identity/tables";
import { mayDeleteComment, notAllowed } from "../model";
import { deleteCommentRow, loadComment } from "../repository";
import type { Uuid } from "../../../domain/shared/identifiers";

export async function deleteComment(actor: Member, id: Uuid | undefined) {
  await db.transaction(async (tx) => {
    const comment = await loadComment(tx, id);

    if (!mayDeleteComment(actor, comment.authorId)) throw notAllowed();

    await deleteCommentRow(tx, comment);
  });
}