import "server-only";
import { eq, sql } from "drizzle-orm";
import { DomainError } from "../../shared/domain-error";
import { db } from "../../shared/db";
import { invitations, members } from "../tables";
import type { Member } from "../sessions";
import { assertAdmin } from "../services/authorization";
import { createToken, hashToken } from "../../shared/tokens";
import { inviteRefusal } from "../services/invitation-rules";
import { openInvitation, sendLink } from "../invitations";

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
  if (refusal) throw new DomainError("invalid", refusal);
}