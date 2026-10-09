import "server-only";
import * as v from "valibot";
import { emailAddress, linkToken } from "./common";
import { newPassword } from "./password";
import { fullName, username } from "./profile";

export const NewInvitation = v.object({
  email: v.pipe(emailAddress, v.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email")),
});
export type NewInvitation = v.InferOutput<typeof NewInvitation>;

export const InvitationLinkLookup = v.object({ token: linkToken });
export type InvitationLinkLookup = v.InferOutput<typeof InvitationLinkLookup>;

export const InvitationAcceptance = v.object({ token: linkToken, fullName, username, password: newPassword });
export type InvitationAcceptance = v.InferOutput<typeof InvitationAcceptance>;