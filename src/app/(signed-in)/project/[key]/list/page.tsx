import { Region } from "../../../../../components/region/Region";
import type { ProjectSummary } from "../../../../../contract";
import { ProjectKey } from "../../../../../domain/shared/identifiers";
import type { Member } from "../../../../../infrastructure/identity/tables";
import { listIssues, listLabels } from "../../../../../queries";
import { signedInPageMember } from "../../../../_server/session";
import { createIssue } from "../actions";
import { assignableMembers, projectAt } from "../project";
import { moreIssues } from "./actions";
import { IssueList } from "./IssueList";

export default async function ListPage({ params, searchParams }: PageProps<"/project/[key]/list">) {
  const member = await signedInPageMember();
  const project = await projectAt((await params).key);
  const query = listQuery(await searchParams);

  return (
    <Region what="issues">
      <ProjectIssues
        member={member}
        project={project}
        query={query}
      />
    </Region>
  );
}

function listQuery(searchParams: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(searchParams)) {
    for (const each of [value ?? []].flat()) if (name !== "offset") query.append(name, each);
  }
  return query.toString();
}

async function ProjectIssues({
  member,
  project,
  query,
}: {
  member: Member;
  project: ProjectSummary;
  query: string;
}) {
  const key = ProjectKey.from(project.key);
  const [page, labels, members] = await Promise.all([
    listIssues(member, key, new URLSearchParams(query)),
    listLabels(member, key),
    assignableMembers(),
  ]);

  return (
    <IssueList
      project={project}
      query={query}
      page={page}
      labels={labels}
      members={members}
      me={member.username}
      createIssue={createIssue}
      moreIssues={moreIssues}
    />
  );
}