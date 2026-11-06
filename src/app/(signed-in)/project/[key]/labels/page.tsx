import { Region } from "../../../../../components/region/Region";
import type { ProjectSummary } from "../../../../../contract";
import { ProjectKey } from "../../../../../domain/shared/identifiers";
import type { Member } from "../../../../../infrastructure/identity/tables";
import { listLabels } from "../../../../../queries";
import { signedInPageMember } from "../../../../_server/session";
import { projectAt } from "../project";
import { createLabel, deleteLabel, updateLabel } from "./actions";
import { Labels } from "./Labels";

export default async function LabelsPage({ params }: PageProps<"/project/[key]/labels">) {
  const member = await signedInPageMember();
  const project = await projectAt((await params).key);

  return (
    <Region what="labels">
      <ProjectLabels
        member={member}
        project={project}
      />
    </Region>
  );
}

async function ProjectLabels({ member, project }: { member: Member; project: ProjectSummary }) {
  return (
    <Labels
      project={project}
      labels={await listLabels(member, ProjectKey.from(project.key))}
      createLabel={createLabel}
      updateLabel={updateLabel}
      deleteLabel={deleteLabel}
    />
  );
}