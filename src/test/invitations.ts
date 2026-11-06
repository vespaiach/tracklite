import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { lookUpInvitation } from "../application/identity/look-up-invitation";
import {
  createInvitation,
  resendInvitation as resend,
  revokeInvitation as revoke,
} from "../app/(signed-in)/settings/members/actions";
import type { ActionResult, Invitation } from "../contract";
import { db } from "../infrastructure/db";
import { DomainError } from "../domain/shared/domain-error";
import { outbox } from "../infrastructure/email/outbox";
import { identityWork } from "../infrastructure/identity/repositories";
import { invitations } from "../infrastructure/identity/tables";
import { createSession, signedInMemberBy } from "../infrastructure/identity/session";
import { listInvitations } from "../queries";
import { createMember } from "./factories";
import { setNextRequest } from "./next-request";

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

function tokenOf(cookie: string) {
  return cookie.slice(cookie.indexOf("=") + 1);
}

async function sentAs<T>(cookie: string, call: () => Promise<T>) {
  const separator = cookie.indexOf("=");
  setNextRequest({ cookies: { [cookie.slice(0, separator)]: cookie.slice(separator + 1) } });
  try {
    return await call();
  } finally {
    setNextRequest({});
  }
}

export function invite(cookie: string, email: unknown) {
  return sentAs(cookie, () => createInvitation({ email }));
}

export async function listedInvitation(cookie: string, email: string) {
  const admin = await signedInMemberBy(tokenOf(cookie));
  if (!admin) throw new Error("Not signed in");
  return (await listInvitations(admin)).find((invitation) => invitation.email === email);
}

export function resendInvitation(cookie: string, id: string) {
  return sentAs(cookie, () => resend({ id }));
}

export function revokeInvitation(cookie: string, id: string) {
  return sentAs(cookie, () => revoke({ id }));
}

export async function lookUp(token: string) {
  try {
    return await lookUpInvitation(identityWork, token);
  } catch (error) {
    if (error instanceof DomainError && error.kind === "expired") return { expired: error.message };
    throw error;
  }
}

export function latestInvitationToken() {
  const token = outbox.sent.at(-1)?.text.match(/token=(\S+)/)?.[1];
  if (!token) throw new Error("No invitation email in the outbox");
  return token;
}

export function invited(result: ActionResult<Invitation>) {
  if (!result.ok) throw new Error(`Inviting was refused: ${result.error.message}`);
  return result.data;
}

export async function invitedBy(cookie: string, email: string) {
  const invitation = invited(await invite(cookie, email));
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