"use server";

import { createInvitation as create } from "../../../../application/identity/create-invitation";
import { resendInvitation as resend } from "../../../../application/identity/resend-invitation";
import { revokeInvitation as revoke } from "../../../../application/identity/revoke-invitation";
import { updateMember as update } from "../../../../application/identity/update-member";
import { tryFrom, Username, Uuid } from "../../../../domain/shared/identifiers";
import { identityWork } from "../../../../infrastructure/identity/repositories";
import { openInvitation } from "../../../../queries";
import { action } from "../../../_server/action";
import { InvitationRef, MemberChanges, NewInvitation } from "../../../_server/schemas/identity";

export const createInvitation = action(
  "createInvitation",
  "member",
  NewInvitation,
  async (actor, { email }) => openInvitation(await create(actor, identityWork, email)),
);

export const resendInvitation = action("resendInvitation", "member", InvitationRef, async (actor, { id }) =>
  openInvitation(await resend(actor, identityWork, tryFrom(Uuid, id))),
);

export const revokeInvitation = action("revokeInvitation", "member", InvitationRef, async (actor, { id }) => {
  await revoke(actor, identityWork, tryFrom(Uuid, id));
  return null;
});

export const updateMember = action(
  "updateMember",
  "member",
  MemberChanges,
  async (actor, { username, ...changes }) => {
    await update(actor, identityWork, tryFrom(Username, username), changes);
    return null;
  },
);