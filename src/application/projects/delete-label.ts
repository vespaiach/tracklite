import type { Actor } from "../../domain/identity/actor";
import type { ProjectRepository } from "../../domain/projects/project-repository";
import type { Uuid } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";

export async function deleteLabel(
  _actor: Actor,
  work: UnitOfWork<{ projects: ProjectRepository }>,
  id: Uuid | undefined,
) {
  await work.run(async ({ projects }) => {
    const { project, labelId } = await projects.withLabel(id);

    project.removeLabel(labelId);

    await projects.save(project);
  });
}