import type { LabelColor } from "./label-color";
import type { LabelName } from "./label-name";
import type { ProjectName } from "./project-name";

export type ProjectChange = {
  name?: ProjectName;
  archived?: boolean;
  description?: string;
  descriptionVersion?: number;
};

export type LabelChange = { name?: LabelName; color?: LabelColor };

export function needsAdmin({ name, archived }: ProjectChange) {
  return name !== undefined || archived !== undefined;
}

export function descriptionSaveOf({ description, descriptionVersion }: ProjectChange) {
  if (description === undefined || descriptionVersion === undefined) return undefined;
  return { description, descriptionVersion };
}