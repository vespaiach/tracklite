import type { Invitation } from "./invitation";

export type InvitationRepository = {
  openFor(email: string, inviterId: string): Promise<Invitation>;
  getOpen(id: string): Promise<Invitation | undefined>;
  byToken(token: string): Promise<Invitation | undefined>;
  bySentMessage(providerMessageId: string): Promise<Invitation | undefined>;
  issueLink(invitation: Invitation): Promise<string>;
  save(invitation: Invitation): Promise<void>;
};