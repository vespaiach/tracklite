import "server-only";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { findMentions } from "../lib/markdown/parse";
import { ApiError } from "./api-error";
import type { db } from "./db";
import { members, mentions } from "./schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type MentionSource = { projectId: string } | { issueId: string } | { commentId: string };

export async function conflict(tx: Transaction, editorId: string | null) {
  const [editor] = editorId
    ? await tx.select({ fullName: members.fullName }).from(members).where(eq(members.id, editorId))
    : [];
  return new ApiError(
    409,
    `This was changed by ${editor?.fullName ?? "someone else"}. Copy your text and reload.`,
  );
}

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