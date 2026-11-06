import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Invitation } from "../contract";
import { type Actor, assertAdmin } from "../domain/identity/actor";
import { memberSummary } from "../domain/identity/member-summary";
import { db } from "../infrastructure/db";
import { invitations, members } from "../infrastructure/identity/tables";

const isOpen = and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt));

function openInvitations() {
  return db
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

export async function listInvitations(actor: Actor) {
  assertAdmin(actor);
  const rows = await openInvitations().where(isOpen).orderBy(invitations.createdAt);
  return rows.map(invitationResponse);
}

export async function openInvitation(id: string) {
  const [row] = await openInvitations().where(and(eq(invitations.id, id), isOpen));
  return invitationResponse(row);
}