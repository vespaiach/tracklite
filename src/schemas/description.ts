import "server-only";
import * as v from "valibot";
import { maxCharacters, version } from "./common";

const maxDescriptionLength = 20_000;

export const descriptionText = v.pipe(
  v.string("Description required"),
  maxCharacters(maxDescriptionLength, "Too long (max 20,000)"),
);
export const descriptionVersion = version;