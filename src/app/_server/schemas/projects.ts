import "server-only";
import * as v from "valibot";
import { LabelColor } from "../../../domain/projects/label-color";
import { LabelName } from "../../../domain/projects/label-name";
import { ProjectName } from "../../../domain/projects/project-name";
import { ProjectKey, tryFrom, Uuid } from "../../../domain/shared/identifiers";

export const ProjectAddress = v.pipe(
  v.string(),
  v.transform((key) => tryFrom(ProjectKey, key)),
);

const LabelAddress = v.pipe(
  v.string(),
  v.transform((id) => tryFrom(Uuid, id)),
);

export const NewProject = v.object({ name: ProjectName.schema, key: ProjectKey.schema });

export const NewLabel = v.object({ name: LabelName.schema, color: LabelColor.schema });

export const LabelChanges = v.object({
  name: v.optional(LabelName.schema),
  color: v.optional(LabelColor.schema),
});

export const ProjectRename = v.object({ key: ProjectAddress, name: ProjectName.schema });

export const ProjectArchiving = v.object({
  key: ProjectAddress,
  archived: v.boolean("Choose true or false"),
});

export const ProjectRef = v.object({ key: ProjectAddress });

export const LabelRef = v.object({ id: LabelAddress });