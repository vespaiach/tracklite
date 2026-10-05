import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import {
  Button,
  Dialog,
  Field,
  FieldError,
  FormStatus,
  Input,
  Menu,
  MenuItem,
  Pill,
  SettingsActions,
  SettingsCell,
  SettingsEmpty,
  SettingsForm,
  SettingsInline,
  SettingsLayout,
  SettingsList,
  SettingsRow,
  SettingsRowActions,
  SettingsSection,
} from "../../components/ui/track-lite";
import {
  type ApiFailure,
  type Label,
  type LabelColor,
  type Project,
  useCreateLabelMutation,
  useDeleteLabelMutation,
  useLabelsQuery,
  useMeQuery,
  useUpdateLabelMutation,
} from "../api";
import { useFailureToast } from "../failure";
import { ProjectGate } from "../ProjectGate";
import { ProjectHeader } from "../ProjectHeader";
import { useShowLoading } from "../useShowLoading";

const labelColors: LabelColor[] = ["gray", "red", "orange", "yellow", "green", "blue", "purple", "pink"];

type FieldErrors = { name?: string; color?: string };

function colorName(color: LabelColor) {
  return color[0].toUpperCase() + color.slice(1);
}

function issueCount(count: number) {
  return (
    <>
      <span className="tl-table__mono">{count}</span> {count === 1 ? "issue" : "issues"}
    </>
  );
}

function fieldErrors(failure: ApiFailure): FieldErrors | undefined {
  if (failure.status !== 422) return undefined;
  return failure.fields ?? { name: failure.message };
}

function ColorMenu({
  label,
  text,
  variant,
  color,
  onChoose,
  controlProps,
}: {
  label: string;
  text: string;
  variant?: "quiet" | "secondary";
  color: LabelColor;
  onChoose: (color: LabelColor) => void;
  controlProps?: { id: string; "aria-describedby"?: string };
}) {
  return (
    <Menu
      {...controlProps}
      label={label}
      text={text}
      variant={variant}
      selectedKey={color}
      onAction={(key) => onChoose(key as LabelColor)}>
      {labelColors.map((each) => (
        <MenuItem
          key={each}
          id={each}>
          {colorName(each)}
        </MenuItem>
      ))}
    </Menu>
  );
}

export function Labels() {
  const { key = "" } = useParams();
  const { data: me } = useMeQuery();
  return (
    <ProjectGate projectKey={key}>
      {(project) => (
        <>
          <ProjectHeader
            project={project}
            view="labels"
            admin={me?.role === "admin"}
          />
          <LabelsPage project={project} />
        </>
      )}
    </ProjectGate>
  );
}

function LabelsPage({ project }: { project: Project }) {
  const labels = useLabelsQuery(project.key);
  const showLoading = useShowLoading(labels.isLoading);
  const canEdit = project.archivedAt === null;
  const [creating, setCreating] = useState(false);
  const newLabel = useRef<HTMLButtonElement>(null);

  function closeCreate() {
    setCreating(false);
    newLabel.current?.focus();
  }

  return (
    <SettingsLayout wide>
      <SettingsSection
        title="Labels"
        status={
          canEdit &&
          labels.data &&
          !creating && (
            <Button
              ref={newLabel}
              size="sm"
              onClick={() => setCreating(true)}>
              <Plus
                size={12}
                weight="duotone"
              />
              New label
            </Button>
          )
        }>
        <p className="tl-field__help">
          Renaming or deleting a label changes every issue in this project that has it.
        </p>
        {labels.isError ? (
          <SettingsActions>
            <FormStatus>Couldn't load this.</FormStatus>
            <Button
              size="sm"
              onClick={labels.refetch}>
              Retry
            </Button>
          </SettingsActions>
        ) : !labels.data ? (
          showLoading && <FormStatus>Loading…</FormStatus>
        ) : (
          <>
            {creating && (
              <CreateForm
                projectKey={project.key}
                onClose={closeCreate}
              />
            )}
            {labels.data.length === 0 ? (
              !creating && <SettingsEmpty>No labels yet. Create one.</SettingsEmpty>
            ) : (
              <SettingsList label="Labels">
                {labels.data.map((label) => (
                  <LabelRow
                    key={label.id}
                    label={label}
                    canEdit={canEdit}
                  />
                ))}
              </SettingsList>
            )}
          </>
        )}
      </SettingsSection>
    </SettingsLayout>
  );
}

function CreateForm({ projectKey, onClose }: { projectKey: string; onClose: () => void }) {
  const [createLabel, { isLoading: saving }] = useCreateLabelMutation();
  const toastFailure = useFailureToast();
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("gray");
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    nameInput.current?.focus();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    try {
      await createLabel({ key: projectKey, name, color }).unwrap();
      onClose();
    } catch (caught) {
      const failure = caught as ApiFailure;
      const fields = fieldErrors(failure);
      if (fields) setErrors(fields);
      else toastFailure(failure);
    }
  }

  return (
    <SettingsForm
      aria-label="New label"
      onSubmit={submit}
      onKeyDown={(event: KeyboardEvent) => event.key === "Escape" && onClose()}>
      <SettingsInline>
        <Field
          label="Name"
          error={errors.name}>
          {(props) => (
            <Input
              {...props}
              ref={nameInput}
              placeholder="Label name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field
          label="Color"
          error={errors.color}>
          {(props) => (
            <ColorMenu
              controlProps={{ id: props.id, "aria-describedby": props["aria-describedby"] }}
              label={`Color: ${colorName(color)}`}
              text={colorName(color)}
              variant="secondary"
              color={color}
              onChoose={setColor}
            />
          )}
        </Field>
        <SettingsActions>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={saving}
            aria-busy={saving || undefined}>
            {saving ? "Creating…" : "Create label"}
          </Button>
          <Button
            size="sm"
            onClick={onClose}>
            Cancel
          </Button>
        </SettingsActions>
      </SettingsInline>
    </SettingsForm>
  );
}

function LabelRow({ label, canEdit }: { label: Label; canEdit: boolean }) {
  const [updateLabel] = useUpdateLabelMutation();
  const toastFailure = useFailureToast();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function recolor(color: LabelColor) {
    try {
      await updateLabel({ id: label.id, color }).unwrap();
    } catch (caught) {
      toastFailure(caught);
    }
  }

  if (renaming) {
    return (
      <SettingsRow>
        <RenameForm
          label={label}
          onClose={() => setRenaming(false)}
        />
      </SettingsRow>
    );
  }

  return (
    <SettingsRow>
      <span>
        <Pill kind="label">{label.name}</Pill>
      </span>
      <SettingsCell>{colorName(label.color)}</SettingsCell>
      <SettingsCell>{issueCount(label.issueCount)}</SettingsCell>
      {canEdit && (
        <SettingsRowActions>
          <Button
            variant="quiet"
            size="sm"
            aria-label={`Rename ${label.name}`}
            onClick={() => setRenaming(true)}>
            Rename
          </Button>
          <ColorMenu
            label={`Change color of ${label.name}`}
            text="Change color"
            color={label.color}
            onChoose={recolor}
          />
          <Button
            variant="quiet"
            size="sm"
            aria-label={`Delete ${label.name}`}
            aria-haspopup="dialog"
            onClick={() => setDeleting(true)}>
            Delete
          </Button>
        </SettingsRowActions>
      )}
      {deleting && (
        <DeleteDialog
          label={label}
          onClose={() => setDeleting(false)}
        />
      )}
    </SettingsRow>
  );
}

function RenameForm({ label, onClose }: { label: Label; onClose: () => void }) {
  const [updateLabel, { isLoading: saving }] = useUpdateLabelMutation();
  const toastFailure = useFailureToast();
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(label.name);
  const [error, setError] = useState<string>();

  useEffect(() => {
    nameInput.current?.select();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    try {
      await updateLabel({ id: label.id, name }).unwrap();
      onClose();
    } catch (caught) {
      const failure = caught as ApiFailure;
      const fields = fieldErrors(failure);
      if (fields) setError(fields.name);
      else toastFailure(failure);
    }
  }

  const errorId = `rename-${label.id}-error`;
  return (
    <SettingsForm
      aria-label={`Rename ${label.name}`}
      onSubmit={submit}
      onKeyDown={(event: KeyboardEvent) => event.key === "Escape" && onClose()}>
      <SettingsInline>
        <div>
          <Input
            ref={nameInput}
            aria-label="Name"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {error && <FieldError id={errorId}>{error}</FieldError>}
        </div>
        <SettingsActions>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={saving}
            aria-busy={saving || undefined}>
            Save
          </Button>
          <Button
            size="sm"
            onClick={onClose}>
            Cancel
          </Button>
        </SettingsActions>
      </SettingsInline>
    </SettingsForm>
  );
}

function DeleteDialog({ label, onClose }: { label: Label; onClose: () => void }) {
  const [deleteLabel, { isLoading }] = useDeleteLabelMutation();
  const toastFailure = useFailureToast();
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  async function confirm() {
    try {
      await deleteLabel(label.id).unwrap();
    } catch (caught) {
      toastFailure(caught);
    }
    onClose();
  }

  return (
    <Dialog
      open
      title={`Delete ${label.name}?`}
      onClose={onClose}
      actions={
        <>
          <Button
            ref={cancel}
            onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={isLoading}
            aria-busy={isLoading || undefined}
            onClick={confirm}>
            Delete
          </Button>
        </>
      }>
      <p>It will be removed from {issueCount(label.issueCount)}.</p>
    </Dialog>
  );
}