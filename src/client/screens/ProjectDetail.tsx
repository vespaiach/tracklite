import { useState } from "react";
import { useParams } from "react-router";
import {
  Button,
  CountRow,
  DetailsLayout,
  DetailsNote,
  DetailsSection,
  IssueEmpty,
  Status,
} from "../../components/ui/track-lite";
import { Markdown } from "../../lib/markdown/Markdown";
import { type IssueStatus, issueStatuses } from "../../contract";
import { type Project, useLazyProjectQuery, useMeQuery, useUpdateProjectMutation } from "../api";
import { CommentThread } from "../CommentThread";
import { formatDay } from "../dates";
import { type DescriptionDraft, DescriptionEditor } from "../DescriptionEditor";
import { statuses } from "../issue-fields";
import { useRouterClick } from "../links";
import { ProjectGate } from "../ProjectGate";
import { ProjectHeader } from "../ProjectHeader";

export function ProjectDetail() {
  const { key = "" } = useParams();
  const { data: me } = useMeQuery();
  return (
    <ProjectGate projectKey={key}>
      {(project) => (
        <>
          <ProjectHeader
            project={project}
            view="detail"
            admin={me?.role === "admin"}
          />
          <DetailsLayout>
            <Description project={project} />
            <IssueCounts project={project} />
            <Created project={project} />
            <DetailsSection title="Comments">
              <CommentThread
                threadPath={`projects/${project.key}/comments`}
                editable={project.archivedAt === null}
              />
            </DetailsSection>
          </DetailsLayout>
        </>
      )}
    </ProjectGate>
  );
}

function startDraft({ description, descriptionVersion }: Project): DescriptionDraft {
  return { text: description, startedFrom: description, version: descriptionVersion };
}

function Description({ project }: { project: Project }) {
  const [draft, setDraft] = useState<DescriptionDraft>();
  const [updateProject] = useUpdateProjectMutation();
  const [loadProject] = useLazyProjectQuery();
  const editable = project.archivedAt === null;

  async function reload() {
    setDraft(startDraft(await loadProject(project.key).unwrap()));
  }

  return (
    <DetailsSection
      title="Description"
      aside={
        editable &&
        !draft && (
          <Button
            variant="quiet"
            size="sm"
            aria-label="Edit project description"
            onClick={() => setDraft(startDraft(project))}>
            Edit
          </Button>
        )
      }>
      {draft ? (
        <DescriptionEditor
          draft={draft}
          onChange={(text) => setDraft({ ...draft, text })}
          onDone={() => setDraft(undefined)}
          onReload={() => void reload()}
          save={(description, descriptionVersion) =>
            updateProject({ key: project.key, description, descriptionVersion }).unwrap()
          }
        />
      ) : project.description ? (
        <Markdown
          source={project.description}
          mentions={project.mentions}
        />
      ) : (
        <IssueEmpty
          action={editable ? "Add one." : undefined}
          onAction={() => setDraft(startDraft(project))}>
          No description yet.
        </IssueEmpty>
      )}
    </DetailsSection>
  );
}

const openStatuses = issueStatuses.filter((status) => status !== "done" && status !== "canceled");

function openCount(counts: Project["issueCounts"]) {
  return openStatuses.reduce((sum, status) => sum + counts[status], 0);
}

function IssueCounts({ project }: { project: Project }) {
  const open = openCount(project.issueCounts);
  return (
    <DetailsSection
      title="Issues"
      aside={
        <>
          <data value={open}>{open}</data> open
        </>
      }>
      {issueStatuses.map((status) => (
        <StatusCountRow
          key={status}
          projectKey={project.key}
          status={status}
          count={project.issueCounts[status]}
        />
      ))}
    </DetailsSection>
  );
}

function StatusCountRow({
  projectKey,
  status,
  count,
}: {
  projectKey: string;
  status: IssueStatus;
  count: number;
}) {
  const href = `/project/${projectKey}/list?status=${status}`;
  const onClick = useRouterClick(href);
  const { name, kind } = statuses[status];
  return (
    <CountRow
      href={href}
      label={`${name}, ${count} ${count === 1 ? "issue" : "issues"}. Open list view`}
      icon={<Status status={kind} />}
      name={name}
      count={count}
      onClick={onClick}
    />
  );
}

function Created({ project: { createdAt, createdBy } }: { project: Project }) {
  return (
    <DetailsNote>
      Created{" "}
      <time
        dateTime={createdAt}
        title={new Date(createdAt).toLocaleString()}>
        {formatDay(createdAt)}
      </time>
      {createdBy && ` by ${createdBy.fullName}`}
    </DetailsNote>
  );
}