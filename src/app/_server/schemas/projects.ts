import "server-only";
import * as v from "valibot";
import { LabelColor } from "../../../domain/projects/label-color";
import { LabelName } from "../../../domain/projects/label-name";
import { ProjectName } from "../../../domain/projects/project-name";
import { ProjectKey } from "../../../domain/shared/identifiers";
import { descriptionText, descriptionVersion } from "../../../server/shared/schemas";

export const NewProject = v.object({ name: ProjectName.schema, key: ProjectKey.schema });

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
    name: v.optional(ProjectName.schema),
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

export const NewLabel = v.object({ name: LabelName.schema, color: LabelColor.schema });

export const LabelChanges = v.object({
  name: v.optional(LabelName.schema),
  color: v.optional(LabelColor.schema),
});