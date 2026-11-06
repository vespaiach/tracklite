import { eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { createMember } from "../../test/factories";
import { uniqueEmail } from "../../test/invitations";
import { db } from "../../infrastructure/db";
import { outbox } from "../../infrastructure/email/outbox";
import { createInvitation } from "./commands/create-invitation";
import { listInvitations } from "./commands/list-invitations";
import { resendInvitation } from "./commands/resend-invitation";
import { revokeInvitation } from "./commands/revoke-invitation";
import { invitations } from "../../infrastructure/identity/tables";
import { createToken, hashToken } from "../../infrastructure/tokens";
import { Uuid } from "../../domain/shared/identifiers";

const forbidden = { kind: "forbidden", message: "You don't have permission to do that." };

async function openInvitation() {
  const admin = await createMember({ role: "admin" });
  const [invitation] = await db
    .insert(invitations)
    .values({
      email: uniqueEmail(),
      invitedBy: admin.id,
      tokenHash: hashToken(createToken()),
      expiresAt: sql`now() + interval '7 days'`,
    })
    .returning();
  return invitation;
}

async function storedInvitation(id: string) {
  const [stored] = await db.select().from(invitations).where(eq(invitations.id, id));
  return stored;
}

it("STD-2: a member can't list invitations", async () => {
  const member = await createMember();

  await expect(listInvitations(member)).rejects.toMatchObject(forbidden);
});

it("STD-2: a member can't invite", async () => {
  const member = await createMember();
  const email = uniqueEmail();

  await expect(createInvitation(member, email)).rejects.toMatchObject(forbidden);

  expect(await db.select().from(invitations).where(eq(invitations.email, email))).toHaveLength(0);
  expect(outbox.sent).toEqual([]);
});

it("STD-2: a member can't resend an invitation", async () => {
  const member = await createMember();
  const invitation = await openInvitation();

  await expect(resendInvitation(member, Uuid.from(invitation.id))).rejects.toMatchObject(forbidden);

  expect((await storedInvitation(invitation.id)).tokenHash).toEqual(invitation.tokenHash);
  expect(outbox.sent).toEqual([]);
});

it("STD-2: a member can't revoke an invitation", async () => {
  const member = await createMember();
  const invitation = await openInvitation();

  await expect(revokeInvitation(member, Uuid.from(invitation.id))).rejects.toMatchObject(forbidden);

  expect((await storedInvitation(invitation.id)).revokedAt).toBeNull();
});