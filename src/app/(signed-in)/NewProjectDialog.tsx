"use client";

import { useId, useState } from "react";
import { Button, Dialog, Field, Input, SettingsForm } from "../../components/ui/track-lite";
import { useFormAction } from "../../components/useFormAction";
import type { FormAction } from "../../contract";
import { loadPage } from "../../lib/load-page";

export type CreateProject = FormAction<{ key: string }>;

export type NewProjectDialogProps = { createProject: CreateProject; onClose: () => void };

export function NewProjectDialog({ createProject, onClose }: NewProjectDialogProps) {
  const formId = useId();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const { error, submit, pending } = useFormAction(
    createProject,
    (created) => {
      onClose();
      loadPage(`/project/${created.key}`);
    },
    [],
  );

  return (
    <Dialog
      open
      title="New project"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            disabled={pending}
            aria-busy={pending || undefined}>
            {pending ? "Creating…" : "Create"}
          </Button>
        </>
      }>
      <SettingsForm
        id={formId}
        onSubmit={submit}>
        <Field
          label="Name"
          error={error?.fields?.name}>
          {(props) => (
            <Input
              {...props}
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field
          label="Key"
          error={error?.fields?.key}
          help={
            <>
              2 to 5 letters. Issue IDs start with it, such as <span className="tl-table__mono">WEB-42</span>.
              It can’t be changed later.
            </>
          }>
          {(props) => (
            <Input
              {...props}
              name="key"
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