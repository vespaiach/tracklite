import "server-only";
import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
import { Invitation, type InvitationProps } from "../../domain/identity/invitation";
import type { InvitationRepository } from "../../domain/identity/invitation-repository";
import { createToken, hashToken } from "../tokens";
import type { Transaction } from "../transaction";
import type { TransactionScope } from "../unit-of-work";
import { invitations } from "./tables";

const invitationColumns = {
  id: invitations.id,
  email: invitations.email,
  invitedBy: invitations.invitedBy,
  providerMessageId: invitations.providerMessageId,
  accepted: sql<boolean>`${invitations.acceptedAt} is not null`,
  revoked: sql<boolean>`${invitations.revokedAt} is not null`,
  bounced: sql<boolean>`${invitations.bouncedAt} is not null`,
  expired: sql<boolean>`${invitations.expiresAt} <= now()`,
};

export function drizzleInvitationRepository({ tx, saved }: TransactionScope): InvitationRepository {
  const loaded = new WeakMap<Invitation, Readonly<InvitationProps>>();

  function track(props: InvitationProps | undefined) {
    if (!props) return undefined;
    const invitation = Invitation.rehydrate(props);
    loaded.set(invitation, invitation.props);
    return invitation;
  }

  async function lockedWhere(condition: SQL | undefined) {
    const [row] = await tx.select(invitationColumns).from(invitations).where(condition).for("update");
    return track(row);
  }

  return {
    async openFor(email, inviterId) {
      const [opened] = await tx.execute<{ id: string }>(sql`
        insert into ${invitations} (email, invited_by, token_hash, expires_at)
        values (${email}, ${inviterId}, ${hashToken(createToken())}, now() + interval '7 days')
        on conflict (lower(email)) where accepted_at is null and revoked_at is null
        do update set email = excluded.email
        returning id`);
      return (await lockedWhere(eq(invitations.id, opened.id))) as Invitation;
    },

    getOpen: (id) =>
      lockedWhere(and(eq(invitations.id, id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt))),

    byToken: (token) => lockedWhere(eq(invitations.tokenHash, hashToken(token))),

    bySentMessage: (providerMessageId) => lockedWhere(eq(invitations.providerMessageId, providerMessageId)),

    issueLink: (invitation) => issueLink(tx, invitation.props.id),

    async save(invitation) {
      const before = loaded.get(invitation);
      if (before) await updateChanged(tx, invitation.props, before);

      loaded.set(invitation, invitation.props);
      saved(invitation);
    },
  };
}

async function issueLink(tx: Transaction, id: string) {
  const token = createToken();
  await tx
    .update(invitations)
    .set({ tokenHash: hashToken(token), expiresAt: sql`now() + interval '7 days'` })
    .where(eq(invitations.id, id));
  return token;
}

function nowIf(flag: boolean) {
  return flag ? sql`now()` : null;
}

async function updateChanged(tx: Transaction, after: InvitationProps, before: InvitationProps) {
  const changes = {
    ...(after.invitedBy !== before.invitedBy && { invitedBy: after.invitedBy }),
    ...(after.providerMessageId !== before.providerMessageId && {
      providerMessageId: after.providerMessageId,
    }),
    ...(after.accepted !== before.accepted && { acceptedAt: nowIf(after.accepted) }),
    ...(after.revoked !== before.revoked && { revokedAt: nowIf(after.revoked) }),
    ...(after.bounced !== before.bounced && { bouncedAt: nowIf(after.bounced) }),
  };
  if (Object.keys(changes).length === 0) return;
  await tx.update(invitations).set(changes).where(eq(invitations.id, after.id));
}