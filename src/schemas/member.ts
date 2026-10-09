import "server-only";
import * as v from "valibot";

export const MemberChanges = v.object({
  role: v.optional(v.picklist(["admin", "member"], "Choose admin or member")),
  deactivated: v.optional(v.boolean("Choose true or false")),
});
export type MemberChanges = v.InferOutput<typeof MemberChanges>;