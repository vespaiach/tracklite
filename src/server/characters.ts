import * as v from "valibot";

export function maxCharacters(max: number, message: string) {
  return v.check((text: string) => [...text].length <= max, message);
}