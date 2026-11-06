import { signedInPageMember } from "../../../_server/session";
import { createIssue } from "./actions";
import { assignableMembers, projectAt } from "./project";
import { ProjectHeader } from "./ProjectHeader";

export default async function ProjectLayout({ children, params }: LayoutProps<"/project/[key]">) {
  const member = await signedInPageMember();
  const project = await projectAt((await params).key);

  return (
    <>
      <ProjectHeader
        project={project}
        admin={member.role === "admin"}
        members={await assignableMembers()}
        me={member.username}
        createIssue={createIssue}
      />
      {children}
    </>
  );
}