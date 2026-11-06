"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useActionCall } from "../../../../../components/useActionCall";
import { useFormAction } from "../../../../../components/useFormAction";
import {
  AppBar,
  Button,
  Crumbs,
  Dialog,
  Fact,
  FactList,
  Field,
  FormStatus,
  Input,
  SettingsActions,
  SettingsForm,
  SettingsInline,
  SettingsLayout,
  SettingsSection,
  Tag,
} from "../../../../../components/ui/track-lite";
import type { ActionResult, FormAction, ProjectSummary } from "../../../../../contract";
import { loadPage } from "../../../../../lib/load-page";

export type ProjectSettingsActions = {
  renameProject: FormAction<{ name: string }>;
  archiveProject: (change: { key: string; archived: boolean }) => Promise<ActionResult<null>>;
  deleteProject: (project: { key: string }) => Promise<ActionResult<null>>;
};

type ProjectSettingsProps = ProjectSettingsActions & { project: ProjectSummary };

export function ProjectSettings({
  project,
  renameProject,
  archiveProject,
  deleteProject,
}: ProjectSettingsProps) {
  const archived = project.archivedAt !== null;

  return (
    <>
      <SettingsTitleBar project={project} />
      <SettingsLayout medium>
        {!archived && (
          <RenameForm
            project={project}
            renameProject={renameProject}
          />
        )}
        <FactList
          stacked
          note={
            <>
              Issue IDs start with the key, such as{" "}
              <span className="tl-table__mono">{`${project.key}-1`}</span>. It can’t be changed.
            </>
          }>
          {archived && <Fact label="Name">{project.name}</Fact>}
          <Fact
            label="Key"
            mono>
            {project.key}
          </Fact>
        </FactList>
        <ArchiveSection
          project={project}
          archiveProject={archiveProject}
        />
        <DeleteSection
          project={project}
          deleteProject={deleteProject}
        />
      </SettingsLayout>
    </>
  );
}

function SettingsTitleBar({ project }: { project: ProjectSummary }) {
  return (
    <AppBar>
      <Crumbs
        items={[
          { label: `${project.name} · ${project.key}`, href: `/project/${project.key}` },
          { label: "Settings" },
        ]}
      />
      {project.archivedAt !== null && <Tag variant="neutral">Archived</Tag>}
    </AppBar>
  );
}

function RenameForm({
  project,
  renameProject,
}: Pick<ProjectSettingsActions, "renameProject"> & { project: ProjectSummary }) {
  const [name, setName] = useState(project.name);
  const [saved, setSaved] = useState(false);
  const { error, submit, pending } = useFormAction(
    renameProject,
    (renamed) => {
      setName(renamed.name);
      setSaved(true);
    },
    ["invalid"],
  );

  return (
    <SettingsForm
      aria-label="Rename project"
      onSubmit={(event) => {
        setSaved(false);
        submit(event);
      }}>
      <input
        type="hidden"
        name="key"
        value={project.key}
      />
      <SettingsInline>
        <Field
          label="Name"
          error={error ? (error.fields?.name ?? error.message) : undefined}>
          {(props) => (
            <Input
              {...props}
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <SettingsActions>
          <Button
            variant="primary"
            type="submit"
            busy={pending ? "Saving…" : undefined}
            aria-busy={pending || undefined}>
            Save
          </Button>
          {saved && <FormStatus>Saved.</FormStatus>}
        </SettingsActions>
      </SettingsInline>
    </SettingsForm>
  );
}

function ArchiveSection({
  project,
  archiveProject,
}: Pick<ProjectSettingsActions, "archiveProject"> & { project: ProjectSummary }) {
  const call = useActionCall();
  const [busy, setBusy] = useState(false);
  const archived = project.archivedAt !== null;
  const action = archived ? "Unarchive project" : "Archive project";

  async function toggle() {
    setBusy(true);
    await call(() => archiveProject({ key: project.key, archived: !archived }));
    setBusy(false);
  }

  return (
    <SettingsSection
      title={action}
      ruled>
      <p className="tl-field__help">
        {archived
          ? "The project returns to the sidebar and becomes editable again."
          : "The project moves to Archived projects. Its description, issues, comments and labels become read-only, and its issues leave My issues. You can unarchive it later."}
      </p>
      <SettingsActions>
        <Button
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={toggle}>
          {action}
        </Button>
      </SettingsActions>
    </SettingsSection>
  );
}

function DeleteSection({
  project,
  deleteProject,
}: Pick<ProjectSettingsActions, "deleteProject"> & { project: ProjectSummary }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <SettingsSection
      title="Delete project"
      ruled>
      <p className="tl-field__help">
        Permanently deletes the project with all its issues and comments. Nothing can be restored.
      </p>
      <SettingsActions>
        <Button
          variant="danger-outline"
          aria-haspopup="dialog"
          onClick={() => setConfirming(true)}>
          <Trash2 size={14} />
          Delete project…
        </Button>
      </SettingsActions>
      {confirming && (
        <DeleteDialog
          project={project}
          deleteProject={deleteProject}
          onCancel={() => setConfirming(false)}
        />
      )}
    </SettingsSection>
  );
}

function DeleteDialog({
  project,
  deleteProject,
  onCancel,
}: Pick<ProjectSettingsActions, "deleteProject"> & { project: ProjectSummary; onCancel: () => void }) {
  const call = useActionCall();
  const cancel = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  async function confirm() {
    setBusy(true);
    if (await call(() => deleteProject({ key: project.key }))) loadPage("/my-issues");
    else setBusy(false);
  }

  return (
    <Dialog
      open
      title={`Delete ${project.name} · ${project.key}?`}
      onClose={onCancel}
      actions={
        <>
          <Button
            ref={cancel}
            onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={typed !== project.key || busy}
            aria-busy={busy || undefined}
            onClick={confirm}>
            Delete project
          </Button>
        </>
      }>
      <SettingsForm
        aria-label="Confirm deletion"
        onSubmit={(event) => event.preventDefault()}>
        <p>This permanently deletes the project with all its issues and comments. Nothing can be restored.</p>
        <Field label={`Type ${project.key} to confirm`}>
          {(props) => (
            <Input
              {...props}
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          )}
        </Field>
      </SettingsForm>
    </Dialog>
  );
}