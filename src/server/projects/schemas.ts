import "server-only";
import * as v from "valibot";
import { labelColors } from "../../contract";
import { descriptionText, descriptionVersion } from "../notifications";
import { maxCharacters } from "../shared/schemas";

const maxProjectNameLength = 50;

const projectName = v.pipe(
  v.string("Name required"),
  v.trim(),
  v.nonEmpty("Name required"),
  maxCharacters(maxProjectNameLength, `Too long (max ${maxProjectNameLength})`),
);

const projectKeyRule = "Key must be 2 to 5 letters";

const projectKey = v.pipe(
  v.string(projectKeyRule),
  v.regex(/^[A-Za-z]{2,5}$/, projectKeyRule),
  v.toUpperCase(),
  v.brand("ProjectKey"),
);

export type ProjectKey = v.InferOutput<typeof projectKey>;

export function parseProjectKey(text: string): ProjectKey | undefined {
  const result = v.safeParse(projectKey, text);
  return result.success ? result.output : undefined;
}

export const NewProject = v.object({ name: projectName, key: projectKey });
export type NewProject = v.InferOutput<typeof NewProject>;

function isMixedChange(body: Record<string, unknown>) {
  const savesDescription = "description" in body || "descriptionVersion" in body;
  const changesSettings = "name" in body || "archived" in body;
  return savesDescription && changesSettings;
}

export const ProjectChanges = v.pipe(
  v.looseObject({}),
  v.check((body) => !isMixedChange(body), "Change one thing at a time"),
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

const maxLabelNameLength = 30;

const labelName = v.pipe(
  v.string("Name required"),
  v.trim(),
  v.nonEmpty("Name required"),
  maxCharacters(maxLabelNameLength, `Too long (max ${maxLabelNameLength})`),
);
const color = v.picklist(labelColors, "Choose a color");

export const NewLabel = v.object({ name: labelName, color });
export type NewLabel = v.InferOutput<typeof NewLabel>;

export const LabelChanges = v.object({ name: v.optional(labelName), color: v.optional(color) });
export type LabelChanges = v.InferOutput<typeof LabelChanges>;