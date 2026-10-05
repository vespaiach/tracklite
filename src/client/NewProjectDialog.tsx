import { type FormEvent, useId, useState } from "react";
import { Button, Dialog, Field, Input, SettingsForm } from "../components/ui/track-lite";

export type NewProject = { name: string; key: string };

export type NewProjectDialogProps = {
  busy: boolean;
  errors: Partial<NewProject>;
  onCancel: () => void;
  onCreate: (project: NewProject) => void;
};

export function NewProjectDialog({ busy, errors, onCancel, onCreate }: NewProjectDialogProps) {
  const formId = useId();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({ name, key });
  }

  return (
    <Dialog
      open
      title="New project"
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            disabled={busy}
            aria-busy={busy || undefined}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </>
      }>
      <SettingsForm
        id={formId}
        onSubmit={submit}>
        <Field
          label="Name"
          error={errors.name}>
          {(props) => (
            <Input
              {...props}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field
          label="Key"
          error={errors.key}
          help={
            <>
              2 to 5 letters. Issue IDs start with it, such as <span className="tl-table__mono">WEB-42</span>.
              It can’t be changed later.
            </>
          }>
          {(props) => (
            <Input
              {...props}
              autoComplete="off"
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          )}
        </Field>
      </SettingsForm>
    </Dialog>
  );
}