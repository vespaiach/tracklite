import "server-only";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { findMentions } from "../../lib/markdown/parse";
import type { Transaction } from "../shared/transaction";
import { members } from "../identity";
import { mentions } from "./tables";

type MentionSource = { projectId: string } | { issueId: string } | { commentId: string };

export async function replaceMentions(tx: Transaction, source: MentionSource, text: string) {
  const memberIds = await activeMemberIds(tx, findMentions(text));

  await tx
    .delete(mentions)
    .where(
      and(mentionsFrom(source), memberIds.length > 0 ? notInArray(mentions.memberId, memberIds) : undefined),
    );

  if (memberIds.length === 0) return [];

  const added = await tx
    .insert(mentions)
    .values(memberIds.map((memberId) => ({ memberId, ...source })))
    .onConflictDoNothing()
    .returning({ memberId: mentions.memberId });
  return added.map((row) => row.memberId);
}

async function activeMemberIds(tx: Transaction, usernames: string[]) {
  if (usernames.length === 0) return [];
  const found = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(inArray(members.username, usernames), isNull(members.deactivatedAt)));
  return found.map((row) => row.id);
}

function mentionsFrom(source: MentionSource) {
  if ("projectId" in source) return eq(mentions.projectId, source.projectId);
  if ("issueId" in source) return eq(mentions.issueId, source.issueId);
  return eq(mentions.commentId, source.commentId);
}