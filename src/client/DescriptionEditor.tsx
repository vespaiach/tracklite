import { type FormEvent, type KeyboardEvent, useId, useState } from "react";
import { Button, Editor, FieldError, SettingsActions } from "../components/ui/track-lite";
import type { ApiFailure } from "./api";
import { useFailureToast } from "./failure";
import { LeaveGuard } from "./LeaveGuard";
import { useMentions } from "./useMentions";

export type DescriptionDraft = { text: string; startedFrom: string; version: number };

export function DescriptionEditor({
  draft,
  onChange,
  onDone,
  save,
}: {
  draft: DescriptionDraft;
  onChange: (text: string) => void;
  onDone: () => void;
  save: (description: string, descriptionVersion: number) => Promise<unknown>;
}) {
  const toastFailure = useFailureToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState<string>();
  const messageId = useId();
  const mentions = useMentions({ value: draft.text, onChange });
  const unsaved = draft.text !== draft.startedFrom;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setConflict(undefined);
    setSaving(true);
    try {
      await save(draft.text, draft.version);
      onDone();
    } catch (caught) {
      const failure = caught as ApiFailure;
      if (failure.status === 422) setError(failure.fields?.description ?? failure.message);
      else if (failure.status === 409) setConflict(failure.message);
      else toastFailure(failure);
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    mentions.textarea.onKeyDown(event);
    if (event.key === "Escape" && !event.defaultPrevented) onDone();
  }

  return (
    <form
      aria-label="Edit description"
      noValidate
      onSubmit={submit}>
      <LeaveGuard
        unsaved={unsaved}
        message="You have unsaved changes. Leave anyway?"
      />
      <Editor
        mono
        invalid={Boolean(error)}
        value={draft.text}
        onChange={mentions.onChange}
        overlay={mentions.list}
        textarea={{
          ...mentions.textarea,
          onKeyDown,
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