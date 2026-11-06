import { LabelColor } from "../../domain/projects/label-color";
import { LabelName } from "../../domain/projects/label-name";
import { Project, type ProjectLabel, type ProjectProps } from "../../domain/projects/project";
import { ProjectName } from "../../domain/projects/project-name";
import { ProjectKey } from "../../domain/shared/identifiers";
import type { labels, projects } from "./tables";

export type ProjectRows = {
  row: typeof projects.$inferSelect;
  labels: Pick<typeof labels.$inferSelect, "id" | "name" | "color">[];
};

export function toProject({ row, labels }: ProjectRows) {
  return Project.rehydrate({
    id: row.id,
    key: ProjectKey.from(row.key),
    name: ProjectName.from(row.name),
    description: row.description,
    descriptionVersion: row.descriptionVersion,
    descriptionEditedBy: row.descriptionEditedBy,
    archived: row.archivedAt !== null,
    createdBy: row.createdBy,
    labels: labels.map(({ id, name, color }) => ({
      id,
      name: LabelName.from(name),
      color: LabelColor.from(color),
    })),
  });
}

export function toRow({ key, name, archived: _archived, labels: _labels, ...fields }: ProjectProps) {
  return { ...fields, key: key.value, name: name.value };
}

export function toLabelRow({ id, name, color }: ProjectLabel) {
  return { id, name: name.value, color: color.value };
}