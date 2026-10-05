import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { type FormEvent, useId, useState } from "react";
import { useNavigate } from "react-router";
import { AppDialog, Button, FieldError, TitleInput } from "../components/ui/track-lite";
import { type ApiFailure, type ProjectSummary, useCreateIssueMutation } from "./api";
import { useFailureToast } from "./failure";

export function NewIssueButton({ project }: { project: ProjectSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="primary"
        size="sm"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}>
        <Plus
          size={12}
          weight="bold"
        />
        New issue
      </Button>
      {open && (
        <NewIssueDialog
          project={project}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function NewIssueDialog({ project, onClose }: { project: ProjectSummary; onClose: () => void }) {
  const formId = useId();
  const errorId = useId();
  const navigate = useNavigate();
  const toastFailure = useFailureToast();
  const [createIssue, { isLoading: saving }] = useCreateIssueMutation();
  const [requestId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    try {
      const created = await createIssue({ key: project.key, requestId, title }).unwrap();
      await navigate(`/issue/${created.id}`);
    } catch (caught) {
      const failure = caught as ApiFailure;
      if (failure.status === 422 && failure.fields?.title) {
        setError(failure.fields.title);
      } else {
        toastFailure(failure);
      }
    }
  }

  return (
    <AppDialog
      open
      label="New issue"
      onClose={onClose}
      head={
        <>
          <b>New issue</b>
          <span>{`in ${project.name} · ${project.key}`}</span>
        </>
      }
      foot={
        <Button
          variant="primary"
          size="sm"
          type="submit"
          form={formId}
          disabled={saving}
          aria-busy={saving || undefined}>
          {saving ? "Creating…" : "Create"}
        </Button>
      }>
      <form
        id={formId}
        noValidate
        onSubmit={submit}>
        <TitleInput
          aria-label="Title"
          placeholder="Issue title"
          autoComplete="off"
          value={title}
          readOnly={saving}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => setTitle(event.target.value)}
        />
        {error && <FieldError id={errorId}>{error}</FieldError>}
      </form>
    </AppDialog>
  );
}