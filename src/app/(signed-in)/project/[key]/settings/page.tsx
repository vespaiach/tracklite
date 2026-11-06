import { signedInPageMember } from "../../../../_server/session";
import { NoPermission } from "../../../settings/SettingsTitle";
import { projectAt } from "../project";
import { archiveProject, deleteProject, renameProject } from "./actions";
import { ProjectSettings } from "./ProjectSettings";

export default async function ProjectSettingsPage({ params }: PageProps<"/project/[key]/settings">) {
  const member = await signedInPageMember();
  const project = await projectAt((await params).key);

  if (member.role !== "admin") return <NoPermission />;
  return (
    <ProjectSettings
      project={project}
      renameProject={renameProject}
      archiveProject={archiveProject}
      deleteProject={deleteProject}
    />
  );
}