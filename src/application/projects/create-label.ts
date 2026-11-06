import type { Actor } from "../../domain/identity/actor";
import type { LabelColor } from "../../domain/projects/label-color";
import type { LabelName } from "../../domain/projects/label-name";
import type { ProjectRepository } from "../../domain/projects/project-repository";
import type { ProjectKey } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";

export type NewLabelInput = { name: LabelName; color: LabelColor };

export async function createLabel(
  _actor: Actor,
  work: UnitOfWork<{ projects: ProjectRepository }>,
  projectKey: ProjectKey | undefined,
  { name, color }: NewLabelInput,
) {
  return work.run(async ({ projects }) => {
    const project = await projects.get(projectKey);

    const labelId = project.addLabel(name, color);

    await projects.save(project);
    return labelId;
  });
}