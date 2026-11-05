import "server-only";
import { db } from "../../shared/db";
import type { Uuid } from "../../shared/ids";
import type { Member } from "../../identity";
import { mayDeleteComment, notAllowed } from "../model";
import { deleteCommentRow, loadComment } from "../repository";

export async function deleteComment(actor: Member, id: Uuid | undefined) {
  await db.transaction(async (tx) => {
    const comment = await loadComment(tx, id);

    if (!mayDeleteComment(actor, comment.authorId)) throw notAllowed();

    await deleteCommentRow(tx, comment);
  });
}