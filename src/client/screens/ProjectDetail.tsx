import { type FormEvent, useEffect, useId, useState } from "react";
import { useBlocker, useParams } from "react-router";
import {
  Button,
  Dialog,
  Editor,
  FieldError,
  FormStatus,
  SettingsActions,
  SettingsLayout,
  SettingsSection,
} from "../../components/ui/track-lite";
import { Markdown } from "../../lib/markdown/Markdown";
import { type ApiFailure, type Project, useMeQuery, useUpdateProjectMutation } from "../api";
import { useFailureToast } from "../failure";
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
          </SettingsLayout>
        </>
      )}
    </ProjectGate>
  );
}

type Draft = { text: string; startedFrom: string; version: number };

function Description({ project }: { project: Project }) {
  const [draft, setDraft] = useState<Draft>();
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
          projectKey={project.key}
          draft={draft}
          onChange={(text) => setDraft({ ...draft, text })}
          onDone={() => setDraft(undefined)}
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

function DescriptionEditor({
  projectKey,
  draft,
  onChange,
  onDone,
}: {
  projectKey: string;
  draft: Draft;
  onChange: (text: string) => void;
  onDone: () => void;
}) {
  const [updateProject, { isLoading: saving }] = useUpdateProjectMutation();
  const toastFailure = useFailureToast();
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState<string>();
  const messageId = useId();
  const unsaved = draft.text !== draft.startedFrom;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setConflict(undefined);
    try {
      await updateProject({
        key: projectKey,
        description: draft.text,
        descriptionVersion: draft.version,
      }).unwrap();
      onDone();
    } catch (caught) {
      const failure = caught as ApiFailure;
      if (failure.status === 422) setError(failure.fields?.description ?? failure.message);
      else if (failure.status === 409) setConflict(failure.message);
      else toastFailure(failure);
    }
  }

  return (
    <form
      aria-label="Edit description"
      noValidate
      onSubmit={submit}>
      <LeaveGuard unsaved={unsaved} />
      <Editor
        value={draft.text}
        onChange={onChange}
        textarea={{
          "aria-label": "Description (Markdown)",
          "aria-invalid": error ? true : undefined,
          "aria-describedby": messageId,
          readOnly: saving,
          rows: 16,
          autoFocus: true,
        }}
        tools={
          conflict && (
            <div role="alert">
              <FieldError>{conflict}</FieldError>
            </div>
          )
        }
        submit={
          <SettingsActions>
            <Button
              size="sm"
              onClick={onDone}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              type="submit"
              disabled={saving}
              aria-busy={saving || undefined}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </SettingsActions>
        }
      />
      {error ? (
        <FieldError id={messageId}>{error}</FieldError>
      ) : (
        <p
          id={messageId}
          className="tl-field__help">
          Markdown. Up to <span className="tl-table__mono">20,000</span> characters.
        </p>
      )}
    </form>
  );
}

function LeaveGuard({ unsaved }: { unsaved: boolean }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => unsaved && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  return (
    blocker.state === "blocked" && (
      <Dialog
        open
        role="alertdialog"
        title="You have unsaved changes. Leave anyway?"
        onClose={blocker.reset}
        actions={
          <>
            <Button onClick={blocker.reset}>Cancel</Button>
            <Button
              variant="danger"
              onClick={blocker.proceed}>
              Leave
            </Button>
          </>
        }
      />
    )
  );
}