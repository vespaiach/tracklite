import { type FormEvent, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, useParams } from "react-router";
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
} from "../../components/ui/track-lite";
import {
  type ApiFailure,
  api,
  type Project,
  useDeleteProjectMutation,
  useMeQuery,
  useUpdateProjectMutation,
} from "../api";
import { useFailureToast } from "../failure";
import { useRouterClick } from "../links";
import { ProjectGate } from "../ProjectGate";

export function ProjectSettings() {
  const { key = "" } = useParams();
  const { data: me } = useMeQuery();
  if (me?.role !== "admin") {
    return (
      <SettingsLayout>
        <FormStatus>You don't have permission to do that.</FormStatus>
      </SettingsLayout>
    );
  }
  return <ProjectGate projectKey={key}>{(project) => <SettingsPage project={project} />}</ProjectGate>;
}

function SettingsPage({ project }: { project: Project }) {
  const full = `${project.name} · ${project.key}`;
  const projectHref = `/project/${project.key}`;
  const projectClick = useRouterClick(projectHref);
  const archived = project.archivedAt !== null;
  return (
    <>
      <AppBar>
        <Crumbs items={[{ label: full, href: projectHref, onClick: projectClick }, { label: "Settings" }]} />
        {archived && <Tag variant="neutral">Archived</Tag>}
      </AppBar>
      <SettingsLayout>
        {archived ? (
          <FactList>
            <Fact label="Name">{project.name}</Fact>
          </FactList>
        ) : (
          <RenameForm project={project} />
        )}
        <FactList
          note={
            <>
              Issue IDs start with the key, such as{" "}
              <span className="tl-table__mono">{`${project.key}-1`}</span>. It can’t be changed.
            </>
          }>
          <Fact
            label="Key"
            mono>
            {project.key}
          </Fact>
        </FactList>
        <ArchiveSection project={project} />
        <DeleteSection project={project} />
      </SettingsLayout>
    </>
  );
}

function RenameForm({ project }: { project: Project }) {
  const [updateProject, { isLoading: saving }] = useUpdateProjectMutation();
  const toastFailure = useFailureToast();
  const [name, setName] = useState(project.name);
  const [error, setError] = useState<string>();
  const [renamedTo, setRenamedTo] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setRenamedTo(undefined);
    try {
      const renamed = await updateProject({ key: project.key, name }).unwrap();
      setName(renamed.name);
      setRenamedTo(renamed.name);
    } catch (caught) {
      const failure = caught as ApiFailure;
      if (failure.status === 422) {
        setError(failure.fields?.name ?? failure.message);
      } else {
        toastFailure(failure);
      }
    }
  }

  return (
    <SettingsForm
      aria-label="Rename project"
      onSubmit={submit}>
      <SettingsInline>
        <Field
          label="Name"
          error={error}>
          {(props) => (
            <Input
              {...props}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <SettingsActions>
          <Button
            variant="primary"
            type="submit"
            disabled={saving}
            aria-busy={saving || undefined}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {renamedTo && <FormStatus>{`Renamed to “${renamedTo}”.`}</FormStatus>}
        </SettingsActions>
      </SettingsInline>
    </SettingsForm>
  );
}

function ArchiveSection({ project }: { project: Project }) {
  const [updateProject, { isLoading }] = useUpdateProjectMutation();
  const toastFailure = useFailureToast();
  const archived = project.archivedAt !== null;
  const action = archived ? "Unarchive project" : "Archive project";

  async function toggle() {
    try {
      await updateProject({ key: project.key, archived: !archived }).unwrap();
    } catch (caught) {
      toastFailure(caught);
    }
  }

  return (
    <SettingsSection title={action}>
      <p className="tl-field__help">
        {archived
          ? "The project returns to the sidebar and becomes editable again."
          : "The project moves to Archived projects. Its description, issues, comments and labels become read-only, and its issues leave My issues. You can unarchive it later."}
      </p>
      <SettingsActions>
        <Button
          disabled={isLoading}
          aria-busy={isLoading || undefined}
          onClick={toggle}>
          {action}
        </Button>
      </SettingsActions>
    </SettingsSection>
  );
}

function DeleteSection({ project }: { project: Project }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <SettingsSection title="Delete project">
      <p className="tl-field__help">
        Permanently deletes the project with all its issues and comments. Nothing can be restored.
      </p>
      <SettingsActions>
        <Button
          aria-haspopup="dialog"
          onClick={() => setConfirming(true)}>
          Delete project…
        </Button>
      </SettingsActions>
      {confirming && (
        <DeleteDialog
          project={project}
          onCancel={() => setConfirming(false)}
        />
      )}
    </SettingsSection>
  );
}

function DeleteDialog({ project, onCancel }: { project: Project; onCancel: () => void }) {
  const [deleteProject, { isLoading }] = useDeleteProjectMutation();
  const toastFailure = useFailureToast();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const cancel = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  async function confirm() {
    try {
      await deleteProject(project.key).unwrap();
      await navigate("/my-issues");
      dispatch(api.util.invalidateTags(["Projects"]));
    } catch (caught) {
      toastFailure(caught);
    }
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
            disabled={typed !== project.key || isLoading}
            aria-busy={isLoading || undefined}
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