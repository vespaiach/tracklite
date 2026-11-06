import type { Actor } from "../identity/actor";
import { AggregateRoot } from "../shared/aggregate-root";
import { DomainError } from "../shared/domain-error";
import type { ProjectKey } from "../shared/identifiers";
import type { LabelColor } from "./label-color";
import type { LabelName } from "./label-name";
import type { LabelChange, ProjectChange } from "./project-change";
import type { ProjectName } from "./project-name";

export type ProjectLabel = Readonly<{ id: string; name: LabelName; color: LabelColor }>;

export type ProjectProps = {
  id: string;
  key: ProjectKey;
  name: ProjectName;
  description: string;
  descriptionVersion: number;
  descriptionEditedBy: string | null;
  archived: boolean;
  createdBy: string | null;
  labels: readonly ProjectLabel[];
};

export function labelGone() {
  return new DomainError("notFound", "That label no longer exists");
}

export class Project extends AggregateRoot {
  #props: Readonly<ProjectProps>;

  private constructor(props: ProjectProps) {
    super();
    this.#props = props;
  }

  get props() {
    return this.#props;
  }

  static rehydrate(props: ProjectProps) {
    return new Project(props);
  }

  static create(actor: Pick<Actor, "id">, { key, name }: Pick<ProjectProps, "key" | "name">) {
    return new Project({
      id: crypto.randomUUID(),
      key,
      name,
      description: "",
      descriptionVersion: 0,
      descriptionEditedBy: null,
      archived: false,
      createdBy: actor.id,
      labels: [],
    });
  }

  assertWritable() {
    if (this.#props.archived) throw new DomainError("forbidden", "This project is archived");
  }

  changeSettings({ name, archived }: Pick<ProjectChange, "name" | "archived">) {
    if (name !== undefined) {
      this.assertWritable();
      this.#change({ name });
    }
    if (archived !== undefined) this.#change({ archived });
  }

  saveDescription(actor: Pick<Actor, "id">, description: string, descriptionVersion: number) {
    this.assertWritable();
    if (this.#props.descriptionVersion !== descriptionVersion) {
      return { conflictWith: this.#props.descriptionEditedBy };
    }

    this.#change({ description, descriptionVersion: descriptionVersion + 1, descriptionEditedBy: actor.id });
    this.record({
      type: "DescriptionSaved",
      actorId: actor.id,
      target: { projectId: this.#props.id },
      text: description,
    });
    return undefined;
  }

  addLabel(name: LabelName, color: LabelColor) {
    this.assertWritable();

    const label = { id: crypto.randomUUID(), name, color };
    this.#change({ labels: [...this.#props.labels, label] });
    return label.id;
  }

  editLabel(labelId: string, { name, color }: LabelChange) {
    this.#assertHasLabel(labelId);

    this.#change({
      labels: this.#props.labels.map((label) =>
        label.id === labelId ? { ...label, name: name ?? label.name, color: color ?? label.color } : label,
      ),
    });
  }

  removeLabel(labelId: string) {
    this.#assertHasLabel(labelId);

    this.#change({ labels: this.#props.labels.filter((label) => label.id !== labelId) });
  }

  #assertHasLabel(labelId: string) {
    this.assertWritable();
    if (!this.#props.labels.some((label) => label.id === labelId)) throw labelGone();
  }

  #change(fields: Partial<ProjectProps>) {
    this.#props = { ...this.#props, ...fields };
  }
}