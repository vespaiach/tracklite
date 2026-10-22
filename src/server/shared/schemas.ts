import "server-only";
import * as v from "valibot";

export function maxCharacters(max: number, message: string) {
  return v.check((text: string) => [...text].length <= max, message);
}

export const requestId = v.pipe(v.string("Invalid request"), v.uuid("Invalid request"));

export const version = v.pipe(v.number("Version required"), v.integer("Version required"));

export const linkToken = v.pipe(
  v.unknown(),
  v.transform((token) => (typeof token === "string" ? token : "")),
);

export const emailAddress = v.pipe(v.string("Enter a valid email"), v.trim(), v.toLowerCase());