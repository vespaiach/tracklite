import "server-only";
import { db } from "../../../infrastructure/db";
import { publishAll } from "../../../infrastructure/events";
import { editConflict } from "../../../domain/shared/edit-conflict";
import { fullNameOf } from "../../../infrastructure/identity/drizzle-member-directory";
import type { Member } from "../../../infrastructure/identity/tables";
import type { CommentEdit } from "../schemas";
import { edit } from "../model";
import { loadComment, oneComment, saveComment } from "../repository";
import type { Uuid } from "../../../domain/shared/identifiers";

export async function editComment(actor: Member, id: Uuid | undefined, { body, version }: CommentEdit) {
  return db.transaction(async (tx) => {
    const before = await loadComment(tx, id);

    const change = edit(before, actor, body, version);
    if ("conflictWith" in change) throw editConflict(await fullNameOf(tx, change.conflictWith));

    await saveComment(tx, before, change.comment);

    await publishAll(tx, change.events);

    return oneComment(tx, change.comment.id);
  });
}