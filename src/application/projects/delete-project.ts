import { type Actor, assertAdmin } from "../../domain/identity/actor";
import type { ProjectRepository } from "../../domain/projects/project-repository";
import type { ProjectKey } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";

export async function deleteProject(
  actor: Actor,
  work: UnitOfWork<{ projects: ProjectRepository }>,
  key: ProjectKey | undefined,
) {
  assertAdmin(actor);
  await work.run(async ({ projects }) => {
    const project = await projects.get(key);

    await projects.remove(project);
  });
}