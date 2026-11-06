import "server-only";
import * as v from "valibot";
import { LabelColor } from "../../../domain/projects/label-color";
import { LabelName } from "../../../domain/projects/label-name";
import { ProjectName } from "../../../domain/projects/project-name";
import { ProjectKey } from "../../../domain/shared/identifiers";

export const NewProject = v.object({ name: ProjectName.schema, key: ProjectKey.schema });

export const ProjectChanges = v.object({
  key: v.optional(v.never("Key can't be changed")),
  name: v.optional(ProjectName.schema),
  archived: v.optional(v.boolean("Choose true or false")),
});

export const NewLabel = v.object({ name: LabelName.schema, color: LabelColor.schema });

export const LabelChanges = v.object({
  name: v.optional(LabelName.schema),
  color: v.optional(LabelColor.schema),
});