import "server-only";
import * as v from "valibot";
import { maxCharacters } from "./common";
import { descriptionText, descriptionVersion } from "./description";

const maxNameLength = 50;

const projectName = v.pipe(
  v.string("Name required"),
  v.trim(),
  v.nonEmpty("Name required"),
  maxCharacters(maxNameLength, `Too long (max ${maxNameLength})`),
);

export const NewProject = v.object({
  name: projectName,
  key: v.pipe(
    v.string("Key must be 2 to 5 letters"),
    v.regex(/^[A-Za-z]{2,5}$/, "Key must be 2 to 5 letters"),
    v.toUpperCase(),
  ),
});
export type NewProject = v.InferOutput<typeof NewProject>;

export const ProjectChanges = v.pipe(
  v.object({
    key: v.optional(v.never("Key can't be changed")),
    name: v.optional(projectName),
    archived: v.optional(v.boolean("Choose true or false")),
    description: v.optional(descriptionText),
    descriptionVersion: v.optional(descriptionVersion),
  }),
  v.forward(
    v.partialCheck(
      [["description"], ["descriptionVersion"]],
      (changes) => changes.description === undefined || changes.descriptionVersion !== undefined,
      "Version required",
    ),
    ["descriptionVersion"],
  ),
  v.forward(
    v.partialCheck(
      [["description"], ["descriptionVersion"]],
      (changes) => changes.descriptionVersion === undefined || changes.description !== undefined,
      "Description required",
    ),
    ["description"],
  ),
);
export type ProjectChanges = v.InferOutput<typeof ProjectChanges>;