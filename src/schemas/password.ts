import "server-only";
import * as v from "valibot";
import { maxCharacters } from "./common";

const minLength = 12;
const maxLength = 128;

export const newPassword = v.pipe(
  v.string(`At least ${minLength} characters`),
  v.check((text) => [...text].length >= minLength, `At least ${minLength} characters`),
  maxCharacters(maxLength, `Too long (max ${maxLength})`),
);