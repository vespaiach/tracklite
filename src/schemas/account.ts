import "server-only";
import * as v from "valibot";
import { emailAddress, linkToken } from "./common";
import { newPassword } from "./password";

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