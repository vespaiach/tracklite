import { useState } from "react";
import { useParams } from "react-router";
import { Button, FormStatus, SettingsLayout, SettingsSection } from "../../components/ui/track-lite";
import { Markdown } from "../../lib/markdown/Markdown";
import { type Project, useMeQuery, useUpdateProjectMutation } from "../api";
import { CommentThread } from "../CommentThread";
import { type DescriptionDraft, DescriptionEditor } from "../DescriptionEditor";
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
          <SettingsLayout wide>
            <Description project={project} />
            <SettingsSection title="Comments">
              <CommentThread
                threadPath={`projects/${project.key}/comments`}
                editable={project.archivedAt === null}
              />
            </SettingsSection>
          </SettingsLayout>
        </>
      )}
    </ProjectGate>
  );
}

function Description({ project }: { project: Project }) {
  const [draft, setDraft] = useState<DescriptionDraft>();
  const [updateProject] = useUpdateProjectMutation();
  const editable = project.archivedAt === null;
  return (
    <SettingsSection
      title="Description"
      status={
        editable &&
        !draft && (
          <Button
            size="sm"
            onClick={() =>
              setDraft({
                text: project.description,
                startedFrom: project.description,
                version: project.descriptionVersion,
              })
            }>
            Edit
          </Button>
        )
      }>
      {draft ? (
        <DescriptionEditor
          draft={draft}
          onChange={(text) => setDraft({ ...draft, text })}
          onDone={() => setDraft(undefined)}
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
        <FormStatus>No description yet. Select Edit to add one.</FormStatus>
      )}
    </SettingsSection>
  );
}