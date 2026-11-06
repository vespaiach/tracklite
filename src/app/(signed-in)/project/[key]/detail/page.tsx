import { Region } from "../../../../../components/region/Region";
import type { ProjectSummary } from "../../../../../contract";
import { ProjectKey } from "../../../../../domain/shared/identifiers";
import type { Member } from "../../../../../infrastructure/identity/tables";
import { getProject, listProjectComments } from "../../../../../queries";
import { signedInPageMember } from "../../../../_server/session";
import { assignableMembers, projectAt } from "../project";
import { deleteComment, editComment, postComment, saveDescription } from "./actions";
import { ProjectComments } from "./ProjectComments";
import { DetailsPage, ProjectDetail } from "./ProjectDetail";

type RegionProps = { member: Member; project: ProjectSummary };

export default async function DetailPage({ params }: PageProps<"/project/[key]/detail">) {
  const member = await signedInPageMember();
  const project = await projectAt((await params).key);

  return (
    <DetailsPage
      details={
        <Region what="this project">
          <Details
            member={member}
            project={project}
          />
        </Region>
      }
      comments={
        <Region what="comments">
          <Comments
            member={member}
            project={project}
          />
        </Region>
      }
    />
  );
}

async function Details({ member, project }: RegionProps) {
  const [details, members] = await Promise.all([
    getProject(member, ProjectKey.from(project.key)),
    assignableMembers(),
  ]);

  return (
    <ProjectDetail
      project={details}
      members={members}
      saveDescription={saveDescription}
    />
  );
}

async function Comments({ member, project }: RegionProps) {
  const [comments, members] = await Promise.all([
    listProjectComments(member, ProjectKey.from(project.key)),
    assignableMembers(),
  ]);

  return (
    <ProjectComments
      projectKey={project.key}
      comments={comments}
      editable={project.archivedAt === null}
      me={member.username}
      admin={member.role === "admin"}
      members={members}
      postComment={postComment}
      editComment={editComment}
      deleteComment={deleteComment}
    />
  );
}