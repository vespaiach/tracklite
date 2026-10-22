import type { ProjectChanges } from "./schemas";

export function needsAdmin({ name, archived }: ProjectChanges) {
  return name !== undefined || archived !== undefined;
}

export function renamesArchived(project: { archivedAt: Date | null }, { name }: ProjectChanges) {
  return name !== undefined && project.archivedAt !== null;
}