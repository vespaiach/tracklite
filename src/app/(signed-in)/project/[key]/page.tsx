import { Region } from "../../../../components/region/Region";
import type { ProjectSummary } from "../../../../contract";
import { ProjectKey } from "../../../../domain/shared/identifiers";
import type { Member } from "../../../../infrastructure/identity/tables";
import { getBoard } from "../../../../queries";
import { signedInPageMember } from "../../../_server/session";
import { createIssue, moveIssue } from "./actions";
import { Board } from "./Board";
import { assignableMembers, projectAt } from "./project";

export default async function BoardPage({ params }: PageProps<"/project/[key]">) {
  const member = await signedInPageMember();
  const project = await projectAt((await params).key);

  return (
    <Region what="the board">
      <ProjectBoard
        member={member}
        project={project}
      />
    </Region>
  );
}

async function ProjectBoard({ member, project }: { member: Member; project: ProjectSummary }) {
  const [columns, members] = await Promise.all([
    getBoard(member, ProjectKey.from(project.key)),
    assignableMembers(),
  ]);

  return (
    <Board
      project={project}
      columns={columns}
      members={members}
      me={member.username}
      createIssue={createIssue}
      moveIssue={moveIssue}
    />
  );
}