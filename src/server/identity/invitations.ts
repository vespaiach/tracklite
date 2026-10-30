import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ApiError } from "../shared/api-error";
import { db } from "../shared/db";
import type { Uuid } from "../shared/ids";
import { sendEmail } from "../shared/email/send";
import { invitationEmail } from "../shared/email/templates";
import type { Invitation, InvitationLookup } from "../../contract";
import type { InvitationAcceptance, Username } from "./schemas";
import { memberSummary } from "./members";
import { hashPassword } from "../shared/passwords";
import { invitations, members } from "./tables";
import { assertAdmin, createSession, type Member } from "./sessions";
import { createToken, hashToken } from "../shared/tokens";
import type { Executor } from "../shared/transaction";
import { checkInvitationLink, inviteRefusal } from "./rules";

const isOpen = and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt));

function notFound() {
  return new ApiError(404, "Not found");
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

function invitationResponse({ inviter, expiresAt, ...invitation }: InvitationRow): Invitation {
  return { ...invitation, invitedBy: memberSummary(inviter), expiresAt: expiresAt.toISOString() };
}

async function openInvitation(id: string) {
  const [row] = await openInvitations(db).where(and(eq(invitations.id, id), isOpen));
  return invitationResponse(row);
}

export async function listInvitations(actor: Member) {
  assertAdmin(actor);
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

  const sent = await sendEmail({
    to: invitation.email,
    ...invitationEmail({ inviterName: inviter.fullName, token }),
  });
  if (!sent.ok) throw new ApiError(503, "We couldn’t send the email. Try again.");

  await executor
    .update(invitations)
    .set({ providerMessageId: sent.value.providerMessageId })
    .where(eq(invitations.id, invitation.id));
}

export async function createInvitation(actor: Member, email: string) {
  assertAdmin(actor);

  await assertNotMember(email);

  const id = await db.transaction(async (tx) => {
    const [opened] = await tx.execute<{ id: string }>(sql`
      insert into ${invitations} (email, invited_by, token_hash, expires_at)
      values (${email}, ${actor.id}, ${hashToken(createToken())}, now() + interval '7 days')
      on conflict (lower(email)) where accepted_at is null and revoked_at is null
      do update set email = excluded.email
      returning id`);
    await sendLink(tx, actor, { id: opened.id, email });
    return opened.id;
  });

  return openInvitation(id);
}

async function assertNotMember(email: string) {
  const [member] = await db
    .select({ deactivatedAt: members.deactivatedAt })
    .from(members)
    .where(eq(sql`lower(${members.email})`, email));
  const refusal = inviteRefusal(member);
  if (refusal) throw new ApiError(422, refusal);
}

export async function resendInvitation(actor: Member, id: Uuid | undefined) {
  assertAdmin(actor);

  if (id === undefined) throw notFound();

  await db.transaction(async (tx) => {
    const invitation = await lockedOpenInvitation(tx, id);
    await sendLink(tx, actor, invitation);
  });

  return openInvitation(id);
}

async function lockedOpenInvitation(executor: Executor, id: string) {
  const [invitation] = await executor
    .select({ id: invitations.id, email: invitations.email })
    .from(invitations)
    .where(and(eq(invitations.id, id), isOpen))
    .for("update");
  if (!invitation) throw notFound();
  return invitation;
}

export async function revokeInvitation(actor: Member, id: Uuid | undefined) {
  assertAdmin(actor);

  if (id === undefined) throw notFound();

  const revoked = await db
    .update(invitations)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(invitations.id, id), isOpen))
    .returning({ id: invitations.id });
  if (revoked.length === 0) throw notFound();
}

function invitationByToken(executor: Pick<typeof db, "select">, token: string) {
  return executor
    .select({
      id: invitations.id,
      email: invitations.email,
      revoked: sql<boolean>`${invitations.revokedAt} is not null`,
      usable: sql<boolean>`${invitations.acceptedAt} is null and ${invitations.expiresAt} > now()`,
    })
    .from(invitations)
    .where(eq(invitations.tokenHash, hashToken(token)))
    .$dynamic();
}

function usableInvitation(invitation: Awaited<ReturnType<typeof invitationByToken>>[number] | undefined) {
  const link = checkInvitationLink(invitation);
  if ("refusal" in link) throw new ApiError(410, link.refusal);
  return link.usable;
}

export async function lookUpInvitation(token: string): Promise<InvitationLookup> {
  const [invitation] = await invitationByToken(db, token);
  return { email: usableInvitation(invitation).email };
}

export async function acceptInvitation({ token, fullName, username, password }: InvitationAcceptance) {
  return db.transaction(async (tx) => {
    const [found] = await invitationByToken(tx, token).for("update");
    const invitation = usableInvitation(found);

    await assertUsernameFree(tx, username);

    const [member] = await tx
      .insert(members)
      .values({
        email: invitation.email,
        fullName,
        username,
        passwordHash: await hashPassword(password),
        role: "member",
      })
      .returning();

    await tx.update(invitations).set({ acceptedAt: sql`now()` }).where(eq(invitations.id, invitation.id));

    return { member, sessionToken: await createSession(member.id, tx) };
  });
}

async function assertUsernameFree(executor: Pick<typeof db, "select">, username: Username) {
  const [taken] = await executor
    .select({ id: members.id })
    .from(members)
    .where(eq(members.username, username));
  if (taken) throw new ApiError(422, "Check the highlighted fields", { username: "Username taken" });
}

export async function markInvitationBounced(providerMessageId: string) {
  const [invitation] = await db
    .update(invitations)
    .set({ bouncedAt: sql`now()` })
    .where(eq(invitations.providerMessageId, providerMessageId))
    .returning({ id: invitations.id });
  return invitation;
}