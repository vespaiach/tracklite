import type { LabelColor } from "../../contract";
import { DomainError } from "../../domain/shared/domain-error";
import type { DomainEvent } from "../../domain/shared/events";
import type { Member } from "../identity";
import type { LabelChanges, ProjectChanges } from "./schemas";

export type ProjectLabel = Readonly<{ id: string; name: string; color: LabelColor }>;

export type Project = Readonly<{
  id: string;
  key: string;
  name: string;
  description: string;
  descriptionVersion: number;
  descriptionEditedBy: string | null;
  archived: boolean;
  createdBy: string | null;
  labels: readonly ProjectLabel[];
}>;

export type ProjectChangeResult = { project: Project; events: DomainEvent[] };

export function needsAdmin({ name, archived }: ProjectChanges) {
  return name !== undefined || archived !== undefined;
}

export function descriptionSaveOf({ description, descriptionVersion }: ProjectChanges) {
  if (description === undefined || descriptionVersion === undefined) return undefined;
  return { description, descriptionVersion };
}

export function labelGone() {
  return new DomainError("notFound", "That label no longer exists");
}

function assertWritable(project: Project) {
  if (project.archived) throw new DomainError("forbidden", "This project is archived");
}

export function newProject(
  actor: Pick<Member, "id">,
  { id, key, name }: Pick<Project, "id" | "key" | "name">,
): Project {
  return {
    id,
    key,
    name,
    description: "",
    descriptionVersion: 0,
    descriptionEditedBy: null,
    archived: false,
    createdBy: actor.id,
    labels: [],
  };
}

export function rename(project: Project, name: string): ProjectChangeResult {
  assertWritable(project);
  return { project: { ...project, name }, events: [] };
}

export function archive(project: Project): ProjectChangeResult {
  return { project: { ...project, archived: true }, events: [] };
}

export function unarchive(project: Project): ProjectChangeResult {
  return { project: { ...project, archived: false }, events: [] };
}

export function changeSettings(project: Project, { name, archived }: ProjectChanges): ProjectChangeResult {
  const renamed = name === undefined ? project : rename(project, name).project;
  if (archived === undefined) return { project: renamed, events: [] };
  return archived ? archive(renamed) : unarchive(renamed);
}

export function saveDescription(
  project: Project,
  actor: Pick<Member, "id">,
  description: string,
  descriptionVersion: number,
): ProjectChangeResult | { conflictWith: string | null } {
  assertWritable(project);
  if (project.descriptionVersion !== descriptionVersion) return { conflictWith: project.descriptionEditedBy };

  return {
    project: {
      ...project,
      description,
      descriptionVersion: descriptionVersion + 1,
      descriptionEditedBy: actor.id,
    },
    events: [
      { type: "DescriptionSaved", actorId: actor.id, target: { projectId: project.id }, text: description },
    ],
  };
}

export function addLabel(project: Project, label: ProjectLabel): ProjectChangeResult {
  assertWritable(project);
  return { project: { ...project, labels: [...project.labels, label] }, events: [] };
}

export function editLabel(project: Project, labelId: string, changes: LabelChanges): ProjectChangeResult {
  assertWritable(project);
  if (!project.labels.some((label) => label.id === labelId)) throw labelGone();

  const labels = project.labels.map((label) =>
    label.id === labelId ? { ...label, ...withoutUndefined(changes) } : label,
  );
  return { project: { ...project, labels }, events: [] };
}

function withoutUndefined({ name, color }: LabelChanges) {
  return { ...(name !== undefined && { name }), ...(color !== undefined && { color }) };
}

export function removeLabel(project: Project, labelId: string): ProjectChangeResult {
  assertWritable(project);
  if (!project.labels.some((label) => label.id === labelId)) throw labelGone();

  return {
    project: { ...project, labels: project.labels.filter((label) => label.id !== labelId) },
    events: [],
  };
}