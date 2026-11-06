import "server-only";
import { db } from "../../../infrastructure/db";
import { publishAll } from "../../../infrastructure/events";
import type { Member } from "../../identity";
import { updatedIssue } from "../../../queries";
import type { IssueId, IssueMove } from "../schemas";
import { move } from "../model";
import { loadIssue, neighboursAt, saveIssue } from "../repository";

export async function moveIssue(_actor: Member, id: IssueId | undefined, { status, place }: IssueMove) {
  return db.transaction(async (tx) => {
    const before = await loadIssue(tx, id);

    const { issue, events } = move(before, status, await neighboursAt(tx, before, status, place));

    await saveIssue(tx, before, issue);

    await publishAll(tx, events);

    return updatedIssue(tx, issue.id);
  });
}