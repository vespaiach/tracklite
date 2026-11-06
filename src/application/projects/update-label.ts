import type { Actor } from "../../domain/identity/actor";
import type { LabelChange } from "../../domain/projects/project-change";
import type { ProjectRepository } from "../../domain/projects/project-repository";
import type { Uuid } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";

export async function updateLabel(
  _actor: Actor,
  work: UnitOfWork<{ projects: ProjectRepository }>,
  id: Uuid | undefined,
  change: LabelChange,
) {
  return work.run(async ({ projects }) => {
    const { project, labelId } = await projects.withLabel(id);

    project.editLabel(labelId, change);

    await projects.save(project);
    return labelId;
  });
}