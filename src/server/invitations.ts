import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ApiError } from "./api-error";
import { db } from "./db";
import { sendEmail } from "./email/send";
import { invitationEmail } from "./email/templates";
import { memberSummary, normalizeEmail } from "./members";
import { invitations, members } from "./schema";
import type { Member } from "./sessions";
import { createToken, hashToken } from "./tokens";

type Executor = Pick<typeof db, "select" | "update">;

const isOpen = and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt));

function notFound() {
  return new ApiError(404, "Not found");
}

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function openInvitations(executor: Pick<typeof db, "select">) {
  return executor
    .select({
      id: invitations.id,
      email: invitations.email,
      expiresAt: invitations.expiresAt,
      state: sql<"pending" | "bounced" | "expired">`case
        when ${invitations.bouncedAt} is not null then 'bounced'
        when ${invitations.expiresAt} < now() then 'expired'
        else 'pending' end`,
      inviter: {
        username: members.username,
        fullName: members.fullName,
        deactivatedAt: members.deactivatedAt,
      },
    })
    .from(invitations)
    .innerJoin(members, eq(members.id, invitations.invitedBy))
    .$dynamic();
}

type InvitationRow = Awaited<ReturnType<typeof openInvitations>>[number];

function invitationResponse({ inviter, expiresAt, ...invitation }: InvitationRow) {
  return { ...invitation, invitedBy: memberSummary(inviter), expiresAt: expiresAt.toISOString() };
}

async function openInvitation(id: string) {
  const [row] = await openInvitations(db).where(and(eq(invitations.id, id), isOpen));
  return invitationResponse(row);
}

export async function listInvitations() {
  const rows = await openInvitations(db).where(isOpen).orderBy(invitations.createdAt);
  return rows.map(invitationResponse);
}

async function sendLink(executor: Executor, inviter: Member, invitation: { id: string; email: string }) {
  const token = createToken();
  await executor
    .update(invitations)
    .set({
      invitedBy: inviter.id,
      tokenHash: hashToken(token),
      expiresAt: sql`now() + interval '7 days'`,
      bouncedAt: null,
    })
    .where(eq(invitations.id, invitation.id));
  const { providerMessageId } = await sendEmail({
    to: invitation.email,
    ...invitationEmail({ inviterName: inviter.fullName, token }),
  }).catch(() => {
    throw new ApiError(503, "We couldn't send the email. Try again.");
  });
  await executor.update(invitations).set({ providerMessageId }).where(eq(invitations.id, invitation.id));
}

export async function createInvitation(inviter: Member, email: unknown) {
  const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : "";
  if (!isEmail(normalizedEmail)) {
    throw new ApiError(422, "Check the highlighted fields", { email: "Enter a valid email" });
  }

  const [member] = await db
    .select({ deactivatedAt: members.deactivatedAt })
    .from(members)
    .where(eq(sql`lower(${members.email})`, normalizedEmail));
  if (member?.deactivatedAt) throw new ApiError(422, "This person is deactivated. Reactivate them instead.");
  if (member) throw new ApiError(422, "Already a member");

  const id = await db.transaction(async (tx) => {
    const [opened] = await tx.execute<{ id: string }>(sql`
      insert into ${invitations} (email, invited_by, token_hash, expires_at)
      values (${normalizedEmail}, ${inviter.id}, ${hashToken(createToken())}, now() + interval '7 days')
      on conflict (lower(email)) where accepted_at is null and revoked_at is null
      do update set email = excluded.email
      returning id`);
    await sendLink(tx, inviter, { id: opened.id, email: normalizedEmail });
    return opened.id;
  });
  return openInvitation(id);
}

export async function resendInvitation(inviter: Member, id: string) {
  if (!isUuid(id)) throw notFound();
  await db.transaction(async (tx) => {
    const [invitation] = await tx
      .select({ id: invitations.id, email: invitations.email })
      .from(invitations)
      .where(and(eq(invitations.id, id), isOpen))
      .for("update");
    if (!invitation) throw notFound();
    await sendLink(tx, inviter, invitation);
  });
  return openInvitation(id);
}

export async function revokeInvitation(id: string) {
  if (!isUuid(id)) throw notFound();
  const revoked = await db
    .update(invitations)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(invitations.id, id), isOpen))
    .returning({ id: invitations.id });
  if (revoked.length === 0) throw notFound();
}

export async function lookUpInvitation(token: string) {
  const [invitation] = await db
    .select({
      email: invitations.email,
      revoked: sql<boolean>`${invitations.revokedAt} is not null`,
      usable: sql<boolean>`${invitations.acceptedAt} is null and ${invitations.expiresAt} > now()`,
    })
    .from(invitations)
    .where(eq(invitations.tokenHash, hashToken(token)));
  if (invitation?.revoked) throw new ApiError(410, "This invitation is no longer valid.");
  if (!invitation?.usable)
    throw new ApiError(410, "This invitation has expired. Ask an admin for a new one.");
  return { email: invitation.email };
}