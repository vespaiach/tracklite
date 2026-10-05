import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { POST as lookUpInvitation } from "../app/api/invitation-lookups/route";
import { DELETE as revoke } from "../app/api/invitations/[id]/route";
import { POST as resend } from "../app/api/invitations/[id]/resend/route";
import { GET as list, POST as create } from "../app/api/invitations/route";
import { db } from "../server/db";
import { outbox } from "../server/email/outbox";
import { invitations } from "../server/schema";
import { createSession } from "../server/sessions";
import { createMember } from "./factories";
import { jsonRequest } from "./reset-links";

export type InvitationBody = {
  id: string;
  email: string;
  invitedBy: { username: string; fullName: string; initials: string; deactivated: boolean };
  expiresAt: string;
  state: "pending" | "bounced" | "expired";
};

export function uniqueEmail(name = "sam") {
  return `${name}-${randomBytes(4).toString("hex")}@acme.com`;
}

export async function signedIn(overrides: Parameters<typeof createMember>[0] = {}) {
  const member = await createMember(overrides);
  return { member, cookie: `session=${await createSession(member.id)}` };
}

export function signedInAdmin(fullName = "Alex Kim") {
  return signedIn({ role: "admin", fullName });
}

export function invite(cookie: string, email: unknown) {
  return create(jsonRequest("POST", "/api/invitations", { email }, { Cookie: cookie }));
}

export function listInvitations(cookie: string) {
  return list(new Request("http://localhost:3000/api/invitations", { headers: { Cookie: cookie } }));
}

export async function listedInvitation(cookie: string, email: string) {
  const body: InvitationBody[] = await (await listInvitations(cookie)).json();
  return body.find((invitation) => invitation.email === email);
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

export function resendInvitation(cookie: string, id: string) {
  return resend(
    jsonRequest("POST", `/api/invitations/${id}/resend`, undefined, { Cookie: cookie }),
    idContext(id),
  );
}

export function revokeInvitation(cookie: string, id: string) {
  return revoke(
    jsonRequest("DELETE", `/api/invitations/${id}`, undefined, { Cookie: cookie }),
    idContext(id),
  );
}

export function lookUp(token: unknown) {
  return lookUpInvitation(jsonRequest("POST", "/api/invitation-lookups", { token }));
}

export function latestInvitationToken() {
  const token = outbox.sent.at(-1)?.text.match(/token=(\S+)/)?.[1];
  if (!token) throw new Error("No invitation email in the outbox");
  return token;
}

export async function invitedBy(cookie: string, email: string) {
  const response = await invite(cookie, email);
  if (response.status !== 201) throw new Error(`Inviting answered ${response.status}`);
  const invitation: InvitationBody = await response.json();
  return { invitation, token: latestInvitationToken() };
}

export async function setInvitationTimestamp(
  id: string,
  column: "expiresAt" | "acceptedAt" | "revokedAt" | "bouncedAt",
  sinceNow: string,
) {
  await db
    .update(invitations)
    .set({ [column]: sql`now() - ${sinceNow}::interval` })
    .where(sql`${invitations.id} = ${id}`);
}