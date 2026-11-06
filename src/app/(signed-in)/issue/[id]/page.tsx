import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CommentThread } from "../../../../components/CommentThread";
import { Region } from "../../../../components/region/Region";
import type { Issue, ProjectSummary } from "../../../../contract";
import { IssueId, ProjectKey, tryFrom } from "../../../../domain/shared/identifiers";
import type { Member } from "../../../../infrastructure/identity/tables";
import { findIssueById, findProject, listIssueComments, listLabels } from "../../../../queries";
import { requestPathHeader } from "../../../../proxy";
import { signedInPageMember } from "../../../_server/session";
import { createIssue } from "../../project/[key]/actions";
import { assignableMembers } from "../../project/[key]/project";
import { ProjectHeader } from "../../project/[key]/ProjectHeader";
import { createLabel, deleteComment, deleteIssue, editComment, postComment, updateIssue } from "./actions";
import { IssueView } from "./IssueView";

export default async function IssuePage({ params }: PageProps<"/issue/[id]">) {
  const member = await signedInPageMember();
  const typedId = (await params).id;

  const issue = await findIssueById(member, tryFrom(IssueId, typedId));
  if (!issue) notFound();
  if (issue.id !== typedId) redirect(await canonicalAddress(typedId, issue.id));

  const project = (await findProject(member, IssueId.from(issue.id).key)) ?? notFound();

  return (
    <>
      <ProjectHeader
        project={project}
        issue={{ id: issue.id, title: issue.title }}
        admin={member.role === "admin"}
        members={await assignableMembers()}
        me={member.username}
        createIssue={createIssue}
      />
      <Region what="this issue">
        <IssueDetails
          member={member}
          issue={issue}
          project={project}
        />
      </Region>
    </>
  );
}

async function canonicalAddress(typedId: string, id: string) {
  const path = (await headers()).get(requestPathHeader) ?? "";
  const typedPath = `/issue/${typedId}`;
  const query = path.startsWith(`${typedPath}?`) ? path.slice(typedPath.length) : "";
  return `/issue/${id}${query}`;
}

type IssueDetailsProps = { member: Member; issue: Issue; project: ProjectSummary };

async function IssueDetails({ member, issue, project }: IssueDetailsProps) {
  const [labels, members] = await Promise.all([
    listLabels(member, ProjectKey.from(project.key)),
    assignableMembers(),
  ]);

  return (
    <IssueView
      issue={issue}
      project={project}
      labels={labels}
      members={members}
      me={{ username: member.username, admin: member.role === "admin" }}
      updateIssue={updateIssue}
      deleteIssue={deleteIssue}
      createLabel={createLabel}
      comments={
        <Region what="comments">
          <IssueComments
            member={member}
            issue={issue}
          />
        </Region>
      }
    />
  );
}

async function IssueComments({ member, issue }: Omit<IssueDetailsProps, "project">) {
  const [comments, members] = await Promise.all([
    listIssueComments(member, IssueId.from(issue.id)),
    assignableMembers(),
  ]);

  return (
    <CommentThread
      threadId={issue.id}
      comments={comments}
      me={{ username: member.username, admin: member.role === "admin" }}
      members={members}
      editable={!issue.archived}
      postComment={postComment}
      editComment={editComment}
      deleteComment={deleteComment}
    />
  );
}