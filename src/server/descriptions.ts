import "server-only";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { findMentions } from "../lib/markdown/parse";
import { ApiError } from "./api-error";
import type { db } from "./db";
import { members, mentions } from "./schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type MentionSource = { projectId: string } | { issueId: string } | { commentId: string };

const maxDescriptionLength = 20_000;

export function parseDescriptionChange(body: Record<string, unknown>) {
  const { description, descriptionVersion } = body;
  const fields: Record<string, string> = {};
  if (typeof description !== "string") fields.description = "Description required";
  else if ([...description].length > maxDescriptionLength) fields.description = "Too long (max 20,000)";
  if (!Number.isInteger(descriptionVersion)) fields.descriptionVersion = "Version required";
  if (Object.keys(fields).length > 0) throw new ApiError(422, "Check the highlighted fields", fields);
  return { description: description as string, descriptionVersion: descriptionVersion as number };
}

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
  const usernames = findMentions(text);
  const mentioned =
    usernames.length === 0
      ? []
      : await tx
          .select({ id: members.id })
          .from(members)
          .where(and(inArray(members.username, usernames), isNull(members.deactivatedAt)));
  const memberIds = mentioned.map((row) => row.id);
  const ofSource =
    "projectId" in source
      ? eq(mentions.projectId, source.projectId)
      : "issueId" in source
        ? eq(mentions.issueId, source.issueId)
        : eq(mentions.commentId, source.commentId);
  await tx
    .delete(mentions)
    .where(and(ofSource, memberIds.length > 0 ? notInArray(mentions.memberId, memberIds) : undefined));
  if (memberIds.length > 0) {
    await tx
      .insert(mentions)
      .values(memberIds.map((memberId) => ({ memberId, ...source })))
      .onConflictDoNothing();
  }
}