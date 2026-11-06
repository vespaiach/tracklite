"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, startTransition, useState } from "react";
import { formatDay } from "../../../../../client/dates";
import { type DescriptionDraft, DescriptionEditor } from "../../../../../client/DescriptionEditor";
import { statuses } from "../../../../../client/issue-fields";
import { useReturnFocus } from "../../../../../client/useReturnFocus";
import {
  Button,
  CountRow,
  DetailsLayout,
  DetailsNote,
  DetailsSection,
  IssueEmpty,
  Status,
} from "../../../../../components/ui/track-lite";
import {
  type ActionResult,
  type IssueStatus,
  issueStatuses,
  type MemberSummary,
  type Project,
} from "../../../../../contract";
import { Markdown } from "../../../../../lib/markdown/Markdown";

export type SaveDescription = (save: {
  key: string;
  description: string;
  descriptionVersion: number;
}) => Promise<ActionResult<null>>;

export type ProjectDetailProps = {
  project: Project;
  members: MemberSummary[];
  saveDescription: SaveDescription;
};

export function DetailsPage({ details, comments }: { details: ReactNode; comments: ReactNode }) {
  return (
    <DetailsLayout>
      {details}
      <DetailsSection title="Comments">{comments}</DetailsSection>
    </DetailsLayout>
  );
}

export function ProjectDetail(props: ProjectDetailProps) {
  return (
    <>
      <Description {...props} />
      <IssueCounts project={props.project} />
      <Created project={props.project} />
    </>
  );
}

function startDraft({ description, descriptionVersion }: Project): DescriptionDraft {
  return { text: description, startedFrom: description, version: descriptionVersion };
}

function Description({ project, members, saveDescription }: ProjectDetailProps) {
  const [draft, setDraft] = useState<DescriptionDraft>();
  const [reloadingFrom, setReloadingFrom] = useState<number>();
  const editButton = useReturnFocus<HTMLButtonElement>(draft !== undefined);
  const router = useRouter();
  const editable = project.archivedAt === null;

  if (reloadingFrom !== undefined && reloadingFrom !== project.descriptionVersion) {
    setReloadingFrom(undefined);
    setDraft(startDraft(project));
  }

  function reload() {
    setReloadingFrom(project.descriptionVersion);
    startTransition(() => router.refresh());
  }

  return (
    <DetailsSection
      title="Description"
      aside={
        editable &&
        !draft && (
          <Button
            ref={editButton}
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
          onReload={reload}
          save={(description, descriptionVersion) =>
            saveDescription({ key: project.key, description, descriptionVersion })
          }
          members={members}
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
  const { name, kind } = statuses[status];
  return (
    <CountRow
      href={`/project/${projectKey}/list?status=${status}`}
      label={`${name}, ${count} ${count === 1 ? "issue" : "issues"}. Open list view`}
      icon={<Status status={kind} />}
      name={name}
      count={count}
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