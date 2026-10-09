import "server-only";
import * as v from "valibot";
import { labelColors } from "../contract";
import { maxCharacters } from "./common";

const maxNameLength = 30;

const labelName = v.pipe(
  v.string("Name required"),
  v.trim(),
  v.nonEmpty("Name required"),
  maxCharacters(maxNameLength, `Too long (max ${maxNameLength})`),
);
const color = v.picklist(labelColors, "Choose a color");

export const NewLabel = v.object({ name: labelName, color });
export type NewLabel = v.InferOutput<typeof NewLabel>;

export const LabelChanges = v.object({ name: v.optional(labelName), color: v.optional(color) });
export type LabelChanges = v.InferOutput<typeof LabelChanges>;