import "server-only";
import * as v from "valibot";
import { roles } from "../contract";
import { emailAddress } from "./common";
import { newPassword } from "./password";
import { fullName, username } from "./profile";

export const MemberChanges = v.object({
  role: v.optional(v.picklist(roles, "Choose admin or member")),
  deactivated: v.optional(v.boolean("Choose true or false")),
});
export type MemberChanges = v.InferOutput<typeof MemberChanges>;

export const FirstAdmin = v.object({ email: emailAddress, fullName, username, password: newPassword });