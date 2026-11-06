import { type FormEvent, type KeyboardEvent, useId, useState } from "react";
import { Button, Editor, EditorNotice, FieldError, SettingsActions } from "../components/ui/track-lite";
import { useToast } from "../components/toast";
import type { ActionResult, MemberSummary } from "../contract";
import { settled } from "./action-result";
import { LeaveGuard } from "./LeaveGuard";
import { useMentions } from "./useMentions";

export type DescriptionDraft = { text: string; startedFrom: string; version: number };

export function DescriptionEditor({
  draft,
  onChange,
  onDone,
  onReload,
  save,
  members,
}: {
  draft: DescriptionDraft;
  onChange: (text: string) => void;
  onDone: () => void;
  onReload: () => void;
  save: (description: string, descriptionVersion: number) => Promise<ActionResult<unknown>>;
  members: MemberSummary[];
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState<string>();
  const messageId = useId();
  const mentions = useMentions({ value: draft.text, onChange, members });
  const unsaved = draft.text !== draft.startedFrom;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setConflict(undefined);
    setSaving(true);
    const result = await settled(save(draft.text, draft.version));
    setSaving(false);

    if (result.ok) onDone();
    else if (result.error.kind === "invalid")
      setError(result.error.fields?.description ?? result.error.message);
    else if (result.error.kind === "conflict") setConflict(result.error.message);
    else toast(result.error.message);
  }

  function reload() {
    setConflict(undefined);
    onReload();
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
            <EditorNotice>
              <FieldError>{conflict}</FieldError>
              <Button
                size="sm"
                onClick={reload}>
                Reload
              </Button>
            </EditorNotice>
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
              disabled={conflict !== undefined}
              busy={saving ? "Saving…" : undefined}
              aria-busy={saving || undefined}>
              Save
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