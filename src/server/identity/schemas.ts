import "server-only";
import * as v from "valibot";
import { roles } from "../../contract";
import { emailAddress, linkToken, maxCharacters } from "../shared/schemas";

const minPasswordLength = 12;
const maxPasswordLength = 128;
const maxFullNameLength = 60;
const usernameRule = "Use 2 to 20 letters, digits or hyphens";

export const newPassword = v.pipe(
  v.string(`At least ${minPasswordLength} characters`),
  v.check((text) => [...text].length >= minPasswordLength, `At least ${minPasswordLength} characters`),
  maxCharacters(maxPasswordLength, `Too long (max ${maxPasswordLength})`),
);

const fullName = v.pipe(
  v.string("Name required"),
  v.trim(),
  v.nonEmpty("Name required"),
  maxCharacters(maxFullNameLength, `Too long (max ${maxFullNameLength})`),
);

export function usernameFormat(message: string) {
  return v.pipe(
    v.string(message),
    v.toLowerCase(),
    v.regex(/^[a-z0-9-]{2,20}$/, message),
    v.brand("Username"),
  );
}

export type Username = v.InferOutput<ReturnType<typeof usernameFormat>>;

export function parseUsername(text: string): Username | undefined {
  const result = v.safeParse(usernameFormat(usernameRule), text);
  return result.success ? result.output : undefined;
}

const username = v.pipe(v.string(usernameRule), v.trim(), usernameFormat(usernameRule));

export const SignIn = v.object({ email: emailAddress, password: v.string("Incorrect password") });
export type SignIn = v.InferOutput<typeof SignIn>;

export const ResetLinkRequest = v.object({ email: emailAddress });
export type ResetLinkRequest = v.InferOutput<typeof ResetLinkRequest>;

export const ResetLinkLookup = v.object({ token: linkToken });
export type ResetLinkLookup = v.InferOutput<typeof ResetLinkLookup>;

export const PasswordReset = v.object({ token: linkToken, password: newPassword });
export type PasswordReset = v.InferOutput<typeof PasswordReset>;

export const PasswordChange = v.object({
  currentPassword: v.string("Incorrect password"),
  newPassword,
});
export type PasswordChange = v.InferOutput<typeof PasswordChange>;

export const ProfileChanges = v.pipe(
  v.looseObject({
    username: v.optional(v.never("Can't be changed")),
    email: v.optional(v.never("Can't be changed")),
  }),
  v.object({ fullName }),
);
export type ProfileChanges = v.InferOutput<typeof ProfileChanges>;

export const NewInvitation = v.object({
  email: v.pipe(emailAddress, v.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email")),
});
export type NewInvitation = v.InferOutput<typeof NewInvitation>;

export const InvitationLinkLookup = v.object({ token: linkToken });
export type InvitationLinkLookup = v.InferOutput<typeof InvitationLinkLookup>;

export const InvitationAcceptance = v.object({ token: linkToken, fullName, username, password: newPassword });
export type InvitationAcceptance = v.InferOutput<typeof InvitationAcceptance>;

export const MemberChanges = v.object({
  role: v.optional(v.picklist(roles, "Choose admin or member")),
  deactivated: v.optional(v.boolean("Choose true or false")),
});
export type MemberChanges = v.InferOutput<typeof MemberChanges>;

export const FirstAdmin = v.object({ email: emailAddress, fullName, username, password: newPassword });