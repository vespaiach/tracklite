import { type Actor, assertAdmin } from "../../domain/identity/actor";
import { Project } from "../../domain/projects/project";
import type { ProjectName } from "../../domain/projects/project-name";
import type { ProjectRepository } from "../../domain/projects/project-repository";
import type { ProjectKey } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";

export type NewProjectInput = { key: ProjectKey; name: ProjectName };

export async function createProject(
  actor: Actor,
  work: UnitOfWork<{ projects: ProjectRepository }>,
  { key, name }: NewProjectInput,
) {
  assertAdmin(actor);
  return work.run(async ({ projects }) => {
    const project = Project.create(actor, { key, name });

    await projects.save(project);
    return project.props.id;
  });
}