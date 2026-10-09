import "server-only";
import * as v from "valibot";
import { maxCharacters } from "./common";

const maxFullNameLength = 60;
const usernameRule = "Use 2 to 20 letters, digits or hyphens";

export const fullName = v.pipe(
  v.string("Name required"),
  v.trim(),
  v.nonEmpty("Name required"),
  maxCharacters(maxFullNameLength, `Too long (max ${maxFullNameLength})`),
);

export const username = v.pipe(
  v.string(usernameRule),
  v.trim(),
  v.toLowerCase(),
  v.regex(/^[a-z0-9-]{2,20}$/, usernameRule),
);

export const ProfileChanges = v.pipe(
  v.looseObject({
    username: v.optional(v.never("Can't be changed")),
    email: v.optional(v.never("Can't be changed")),
  }),
  v.object({ fullName }),
);
export type ProfileChanges = v.InferOutput<typeof ProfileChanges>;