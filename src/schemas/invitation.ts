import "server-only";
import * as v from "valibot";

export const NewInvitation = v.object({
  email: v.pipe(
    v.string("Enter a valid email"),
    v.trim(),
    v.toLowerCase(),
    v.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email"),
  ),
});
export type NewInvitation = v.InferOutput<typeof NewInvitation>;