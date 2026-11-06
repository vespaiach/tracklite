"use client";

import { Plus, Users } from "lucide-react";
import { type FormEvent, useId, useState, useTransition } from "react";
import { assigneeOptions, memberNames, toggled } from "../../../../client/IssueCells";
import { statuses } from "../../../../client/issue-fields";
import { useToast } from "../../../../components/toast";
import {
  AppDialog,
  AvatarStack,
  Button,
  FieldError,
  MultiPicker,
  Status,
  TitleInput,
} from "../../../../components/ui/track-lite";
import { useRequestId } from "../../../../components/useRequestId";
import type {
  ActionResult,
  IssueDraft,
  IssueStatus,
  MemberSummary,
  ProjectSummary,
} from "../../../../contract";

const couldNotSave = "Couldn’t save. Try again.";

export type CreateIssue = (draft: IssueDraft) => Promise<ActionResult<{ id: string }>>;

export type NewIssueProps = {
  project: ProjectSummary;
  members: MemberSummary[];
  me: string;
  createIssue: CreateIssue;
  onCreated: (id: string) => void;
};

export function NewIssueButton(props: NewIssueProps) {
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
          {...props}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export type NewIssueDialogProps = NewIssueProps & { status?: IssueStatus; onClose: () => void };

export function NewIssueDialog({
  project,
  members,
  me,
  createIssue,
  onCreated,
  status,
  onClose,
}: NewIssueDialogProps) {
  const formId = useId();
  const errorId = useId();
  const toast = useToast();
  const [saving, startSaving] = useTransition();
  const [requestId] = useRequestId();
  const [title, setTitle] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>();
  const error = errors?.title;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors(undefined);
    startSaving(async () => {
      const result = await createIssue({ key: project.key, requestId, title, status, assignees }).catch(
        () => undefined,
      );

      if (result?.ok) onCreated(result.data.id);
      else if (result?.error.fields) setErrors(result.error.fields);
      else toast(result?.error.message ?? couldNotSave);
    });
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
            members={members}
            me={me}
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

type AssigneesChoiceProps = {
  members: MemberSummary[];
  me: string;
  chosen: string[];
  error?: string;
  onToggle: (username: string) => void;
};

function AssigneesChoice({ members, me, chosen, error, onToggle }: AssigneesChoiceProps) {
  const errorId = useId();
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
        {assigneeOptions(members, me)}
      </MultiPicker>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </>
  );
}

function ChosenAssignees({ members, me }: { members: MemberSummary[]; me: string }) {
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
        me={me}
      />
      <span>{memberNames(members)}</span>
    </>
  );
}