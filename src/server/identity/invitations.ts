import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { DomainError } from "../shared/domain-error";
import { db } from "../shared/db";
import { sendEmail } from "../shared/email/send";
import { invitationEmail } from "../shared/email/templates";
import type { Invitation } from "../../contract";
import { memberSummary } from "./members";
import { invitations, members } from "./tables";
import type { Member } from "./sessions";
import { createToken, hashToken } from "../shared/tokens";
import type { Executor } from "../shared/transaction";
import { checkInvitationLink } from "./rules";

export const isOpen = and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt));

export function notFound() {
  return new DomainError("notFound", "Not found");
}

export function openInvitations(executor: Pick<typeof db, "select">) {
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

export function invitationResponse({ inviter, expiresAt, ...invitation }: InvitationRow): Invitation {
  return { ...invitation, invitedBy: memberSummary(inviter), expiresAt: expiresAt.toISOString() };
}

export async function openInvitation(id: string) {
  const [row] = await openInvitations(db).where(and(eq(invitations.id, id), isOpen));
  return invitationResponse(row);
}

export async function sendLink(
  executor: Executor,
  inviter: Member,
  invitation: { id: string; email: string },
) {
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
  if (!sent.ok) throw new DomainError("unavailable", "We couldn’t send the email. Try again.");

  await executor
    .update(invitations)
    .set({ providerMessageId: sent.value.providerMessageId })
    .where(eq(invitations.id, invitation.id));
}

export function invitationByToken(executor: Pick<typeof db, "select">, token: string) {
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

export function usableInvitation(
  invitation: Awaited<ReturnType<typeof invitationByToken>>[number] | undefined,
) {
  const link = checkInvitationLink(invitation);
  if ("refusal" in link) throw new DomainError("expired", link.refusal);
  return link.usable;
}