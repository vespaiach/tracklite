import { type Actor, assertAdmin } from "../../domain/identity/actor";
import type { MemberDirectory } from "../../domain/identity/member-directory";
import type { Project } from "../../domain/projects/project";
import { descriptionSaveOf, needsAdmin, type ProjectChange } from "../../domain/projects/project-change";
import type { ProjectRepository } from "../../domain/projects/project-repository";
import { editConflict } from "../../domain/shared/edit-conflict";
import type { ProjectKey } from "../../domain/shared/identifiers";
import type { UnitOfWork } from "../shared/unit-of-work";

type Repositories = { projects: ProjectRepository; members: MemberDirectory };

async function saveDescription(
  actor: Actor,
  members: MemberDirectory,
  project: Project,
  { description, descriptionVersion }: { description: string; descriptionVersion: number },
) {
  const refused = project.saveDescription(actor, description, descriptionVersion);
  if (refused) throw editConflict(await members.fullNameOf(refused.conflictWith));
}

export async function updateProject(
  actor: Actor,
  work: UnitOfWork<Repositories>,
  key: ProjectKey | undefined,
  change: ProjectChange,
) {
  const descriptionSave = descriptionSaveOf(change);

  if (needsAdmin(change)) assertAdmin(actor);

  return work.run(async ({ projects, members }) => {
    const project = await projects.get(key);

    if (descriptionSave) await saveDescription(actor, members, project, descriptionSave);
    else project.changeSettings(change);

    await projects.save(project);
    return project.props.id;
  });
}