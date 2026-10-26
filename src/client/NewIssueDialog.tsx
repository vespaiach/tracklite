import { Plus, Users } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useNavigate } from "react-router";
import {
  AppDialog,
  AvatarStack,
  Button,
  FieldError,
  MultiPicker,
  Status,
  TitleInput,
} from "../components/ui/track-lite";
import {
  type ApiFailure,
  type IssueStatus,
  type Me,
  type ProjectSummary,
  useCreateIssueMutation,
  useMeQuery,
  useMembersQuery,
} from "./api";
import { useFailureToast } from "./failure";
import { assigneeOptions, memberNames, toggled } from "./IssueCells";
import { statuses } from "./issue-fields";

export function NewIssueButton({ project }: { project: ProjectSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="primary"
        size="sm"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}>
        <Plus size={12} />
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

export type NewIssueDialogProps = { project: ProjectSummary; status?: IssueStatus; onClose: () => void };

export function NewIssueDialog({ project, status, onClose }: NewIssueDialogProps) {
  const formId = useId();
  const errorId = useId();
  const navigate = useNavigate();
  const toastFailure = useFailureToast();
  const [createIssue, { isLoading: saving }] = useCreateIssueMutation();
  const [requestId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>();
  const error = errors?.title;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors(undefined);
    try {
      const created = await createIssue({ key: project.key, requestId, title, status, assignees }).unwrap();
      await navigate(`/issue/${created.id}`);
    } catch (caught) {
      const failure = caught as ApiFailure;
      if (failure.status === 422 && failure.fields) {
        setErrors(failure.fields);
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
        <>
          <AssigneesChoice
            chosen={assignees}
            error={errors?.assignees}
            onToggle={(username) => setAssignees(toggled(assignees, username))}
          />
          <Button
            variant="primary"
            size="sm"
            type="submit"
            form={formId}
            disabled={saving}
            aria-busy={saving || undefined}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </>
      }>
      <form
        id={formId}
        noValidate
        onSubmit={submit}>
        {status && <StartingStatus status={status} />}
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

function StartingStatus({ status }: { status: IssueStatus }) {
  const { name, kind } = statuses[status];
  return (
    <p className="tl-form-status">
      It starts in <Status status={kind} />
      {name}.
    </p>
  );
}

function AssigneesChoice({
  chosen,
  error,
  onToggle,
}: {
  chosen: string[];
  error?: string;
  onToggle: (username: string) => void;
}) {
  const { data: members } = useMembersQuery();
  const { data: me } = useMeQuery();
  const errorId = useId();
  if (!members) return null;
  return (
    <>
      <MultiPicker
        label="Assignees"
        variant="secondary"
        selectedKeys={chosen}
        value={
          <ChosenAssignees
            members={members.filter((member) => chosen.includes(member.username))}
            me={me}
          />
        }
        aria-describedby={error ? errorId : undefined}
        onToggle={(key) => onToggle(String(key))}
        search={{ label: "Filter members", placeholder: "Assign to…" }}>
        {assigneeOptions(members, me?.username)}
      </MultiPicker>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </>
  );
}

function ChosenAssignees({ members, me }: { members: Me[]; me?: Me }) {
  if (members.length === 0) {
    return (
      <>
        <Users size={14} />
        <span>Assignees</span>
      </>
    );
  }
  return (
    <>
      <AvatarStack
        members={members}
        me={me?.username}
      />
      <span>{memberNames(members)}</span>
    </>
  );
}