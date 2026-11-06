"use client";

import { Ellipsis, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, type Ref, useEffect, useRef, useState } from "react";
import type { Key } from "react-aria-components";
import { useReturnFocus } from "../../../../../client/useReturnFocus";
import { useActionCall } from "../../../../../components/useActionCall";
import { useFormAction } from "../../../../../components/useFormAction";
import {
  Button,
  Dialog,
  Field,
  FieldError,
  Input,
  IssueEmpty,
  Menu,
  MenuItem,
  MenuSubmenu,
  Pill,
  SettingsActions,
  SettingsCell,
  SettingsForm,
  SettingsInline,
  SettingsLayout,
  SettingsList,
  SettingsRow,
  SettingsRowActions,
  SettingsSection,
} from "../../../../../components/ui/track-lite";
import {
  type ActionError,
  type ActionResult,
  type Label,
  type LabelColor,
  labelColors,
  type ProjectSummary,
} from "../../../../../contract";

type LabelChange = { id: string; name?: string; color?: LabelColor };

type LabelAction<Input> = (input: Input) => Promise<ActionResult<null>>;

export type LabelsActions = {
  createLabel: LabelAction<FormData>;
  updateLabel: LabelAction<FormData | LabelChange>;
  deleteLabel: LabelAction<{ id: string }>;
};

type LabelsProps = LabelsActions & { project: ProjectSummary; labels: Label[] };

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

function fieldErrors(error: ActionError | null): { name?: string; color?: string } {
  if (!error) return {};
  return error.fields ?? { name: error.message };
}

function useRefreshWhenGone<Input>(act: LabelAction<Input>): LabelAction<Input> {
  const router = useRouter();

  return async (input) => {
    const result = await act(input);
    if (!result.ok && result.error.kind === "notFound") router.refresh();
    return result;
  };
}

function ColorMenu({
  color,
  onChoose,
  controlProps,
}: {
  color: LabelColor;
  onChoose: (color: LabelColor) => void;
  controlProps: { id: string; "aria-describedby"?: string };
}) {
  return (
    <Menu
      {...controlProps}
      label={`Color: ${colorName(color)}`}
      text={colorName(color)}
      variant="secondary"
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

export function Labels({ project, labels, ...actions }: LabelsProps) {
  const canEdit = project.archivedAt === null;
  const [creating, setCreating] = useState(false);
  const newLabel = useReturnFocus<HTMLButtonElement>(creating);

  return (
    <SettingsLayout medium>
      <SettingsSection
        title="Labels"
        action={
          canEdit &&
          !creating && (
            <Button
              ref={newLabel}
              size="sm"
              onClick={() => setCreating(true)}>
              <Plus size={12} />
              New label
            </Button>
          )
        }>
        <p className="tl-field__help">
          Renaming or deleting a label changes every issue in this project that has it.
        </p>
        {creating && (
          <CreateForm
            projectKey={project.key}
            createLabel={actions.createLabel}
            onClose={() => setCreating(false)}
          />
        )}
        {labels.length === 0 ? (
          !creating && (
            <IssueEmpty
              action={canEdit ? "Create one." : undefined}
              onAction={() => setCreating(true)}>
              No labels yet.
            </IssueEmpty>
          )
        ) : (
          <SettingsList label="Labels">
            {labels.map((label) => (
              <LabelRow
                key={label.id}
                label={label}
                canEdit={canEdit}
                {...actions}
              />
            ))}
          </SettingsList>
        )}
      </SettingsSection>
    </SettingsLayout>
  );
}

function CreateForm({
  projectKey,
  createLabel,
  onClose,
}: Pick<LabelsActions, "createLabel"> & { projectKey: string; onClose: () => void }) {
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("gray");
  const { error, submit, pending } = useFormAction(createLabel, onClose, ["invalid"]);
  const errors = fieldErrors(error);

  useEffect(() => {
    nameInput.current?.focus();
  }, []);

  return (
    <SettingsForm
      aria-label="New label"
      onSubmit={submit}
      onKeyDown={(event: KeyboardEvent) => event.key === "Escape" && onClose()}>
      <input
        type="hidden"
        name="key"
        value={projectKey}
      />
      <input
        type="hidden"
        name="color"
        value={color}
      />
      <SettingsInline>
        <Field
          label="Name"
          error={errors.name}>
          {(props) => (
            <Input
              {...props}
              ref={nameInput}
              name="name"
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
            disabled={pending}
            aria-busy={pending || undefined}>
            {pending ? "Creating…" : "Create label"}
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

function LabelRow({
  label,
  canEdit,
  updateLabel,
  deleteLabel,
}: Omit<LabelsActions, "createLabel"> & { label: Label; canEdit: boolean }) {
  const call = useActionCall();
  const update = useRefreshWhenGone(updateLabel);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const actions = useReturnFocus<HTMLButtonElement>(renaming);

  if (renaming) {
    return (
      <SettingsRow>
        <RenameForm
          label={label}
          updateLabel={update}
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
          <LabelActions
            ref={actions}
            label={label}
            onRename={() => setRenaming(true)}
            onRecolor={(color) => call(() => update({ id: label.id, color }))}
            onDelete={() => setDeleting(true)}
          />
        </SettingsRowActions>
      )}
      {deleting && (
        <DeleteDialog
          label={label}
          deleteLabel={deleteLabel}
          onClose={() => setDeleting(false)}
        />
      )}
    </SettingsRow>
  );
}

function LabelActions({
  ref,
  label,
  onRename,
  onRecolor,
  onDelete,
}: {
  ref: Ref<HTMLButtonElement>;
  label: Label;
  onRename: () => void;
  onRecolor: (color: LabelColor) => void;
  onDelete: () => void;
}) {
  function act(key: Key) {
    if (key === "rename") onRename();
    else if (key === "delete") onDelete();
    else onRecolor(key as LabelColor);
  }

  return (
    <Menu
      ref={ref}
      label={`Actions for ${label.name}`}
      icon={<Ellipsis size={15} />}
      onAction={act}>
      <MenuItem id="rename">Rename</MenuItem>
      <MenuSubmenu label="Change color…">
        {labelColors.map((each) => (
          <MenuItem
            key={each}
            id={each}
            checked={each === label.color}>
            {colorName(each)}
          </MenuItem>
        ))}
      </MenuSubmenu>
      <MenuItem
        id="delete"
        danger>
        Delete…
      </MenuItem>
    </Menu>
  );
}

function RenameForm({
  label,
  updateLabel,
  onClose,
}: Pick<LabelsActions, "updateLabel"> & { label: Label; onClose: () => void }) {
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(label.name);
  const { error, submit, pending } = useFormAction(updateLabel, onClose, ["invalid"]);
  const errorText = fieldErrors(error).name;

  useEffect(() => {
    nameInput.current?.focus();
    nameInput.current?.select();
  }, []);

  const errorId = `rename-${label.id}-error`;
  return (
    <SettingsForm
      aria-label={`Rename ${label.name}`}
      onSubmit={submit}
      onKeyDown={(event: KeyboardEvent) => event.key === "Escape" && onClose()}>
      <input
        type="hidden"
        name="id"
        value={label.id}
      />
      <SettingsInline>
        <div>
          <Input
            ref={nameInput}
            name="name"
            aria-label="Name"
            readOnly={pending}
            aria-invalid={errorText ? true : undefined}
            aria-describedby={errorText ? errorId : undefined}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {errorText && <FieldError id={errorId}>{errorText}</FieldError>}
        </div>
        <SettingsActions>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={pending}
            aria-busy={pending || undefined}>
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

function DeleteDialog({
  label,
  deleteLabel,
  onClose,
}: Pick<LabelsActions, "deleteLabel"> & { label: Label; onClose: () => void }) {
  const call = useActionCall();
  const remove = useRefreshWhenGone(deleteLabel);
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  async function confirm() {
    setBusy(true);
    await call(() => remove({ id: label.id }));
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
            busy={busy ? "Deleting…" : undefined}
            aria-busy={busy || undefined}
            onClick={confirm}>
            Delete
          </Button>
        </>
      }>
      <p>It will be removed from {issueCount(label.issueCount)}.</p>
    </Dialog>
  );
}