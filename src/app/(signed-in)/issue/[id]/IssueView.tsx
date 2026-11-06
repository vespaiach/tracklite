"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { formatDate } from "../../../../client/dates";
import { assigneeOptions, memberNames, toggled } from "../../../../client/IssueCells";
import { priorities, statuses } from "../../../../client/issue-fields";
import { useReturnFocus } from "../../../../client/useReturnFocus";
import { type DescriptionDraft, DescriptionEditor } from "../../../../components/DescriptionEditor";
import { useToast } from "../../../../components/toast";
import {
  Avatar,
  AvatarStack,
  Button,
  Dialog,
  FieldError,
  FormStatus,
  IssueEmpty,
  IssueLayout,
  IssueSection,
  IssueSideFoot,
  IssueTitle,
  IssueTitleInput,
  Meta,
  MultiPicker,
  Picker,
  PickerItem,
  PickValue,
  Pill,
  Priority,
  Status,
} from "../../../../components/ui/track-lite";
import {
  type ActionError,
  type ActionResult,
  type Issue,
  type IssuePriority,
  type IssueStatus,
  issuePriorities,
  issueStatuses,
  type Label,
  type LabelColor,
  type MemberSummary,
  type ProjectSummary,
} from "../../../../contract";
import { loadPage } from "../../../../lib/load-page";
import { Markdown } from "../../../../lib/markdown/Markdown";

export type IssueChange =
  | { title: string }
  | { status: IssueStatus }
  | { priority: IssuePriority }
  | { assignees: string[] }
  | { labelIds: string[] }
  | { description: string; descriptionVersion: number };

export type IssueActions = {
  updateIssue: (change: { id: string } & IssueChange) => Promise<ActionResult<Issue>>;
  deleteIssue: (issue: { id: string }) => Promise<ActionResult<null>>;
  createLabel: (label: { key: string; name: string; color: LabelColor }) => Promise<ActionResult<Label>>;
};

export type IssueViewProps = IssueActions & {
  issue: Issue;
  project: ProjectSummary;
  labels: Label[];
  members: MemberSummary[];
  me: { username: string; admin: boolean };
  comments: ReactNode;
};

type SaveOutcome = { saved?: Issue; fieldError?: string; refusal?: ActionError };

type Save = (change: IssueChange) => Promise<SaveOutcome>;

const couldNotSave = "Couldn’t save. Try again.";

function useIssueSave(id: string, updateIssue: IssueActions["updateIssue"]): Save {
  const toast = useToast();
  return async (change) => {
    const result = await updateIssue({ id, ...change }).catch(() => undefined);
    if (!result) {
      toast(couldNotSave);
      return {};
    }
    if (result.ok) return { saved: result.data };

    const { kind, fields, message } = result.error;
    const fieldError = kind === "invalid" ? Object.values(fields ?? {})[0] : undefined;
    if (!fieldError) toast(message);
    return { fieldError, refusal: result.error };
  };
}

export function IssueView({ issue, project, labels, members, me, comments, ...actions }: IssueViewProps) {
  const save = useIssueSave(issue.id, actions.updateIssue);
  const editable = !issue.archived;
  const canDelete = editable && (me.admin || me.username === issue.createdBy.username);
  return (
    <IssueLayout
      title={
        editable ? (
          <TitleEditor
            issue={issue}
            save={save}
          />
        ) : (
          <IssueTitle>{issue.title}</IssueTitle>
        )
      }
      main={
        <>
          <Description
            issue={issue}
            members={members}
            editable={editable}
            updateIssue={actions.updateIssue}
          />
          <IssueSection title="Comments">{comments}</IssueSection>
        </>
      }
      side={
        <>
          <StatusField
            issue={issue}
            editable={editable}
            save={save}
          />
          <PriorityField
            issue={issue}
            editable={editable}
            save={save}
          />
          <AssigneesField
            issue={issue}
            members={members}
            me={me.username}
            editable={editable}
            save={save}
          />
          <LabelsField
            issue={issue}
            labels={labels}
            projectKey={project.key}
            editable={editable}
            save={save}
            createLabel={actions.createLabel}
          />
          <IssueSideFoot>
            <FormStatus>
              {`Created by ${issue.createdBy.fullName}, `}
              <time
                dateTime={issue.createdAt}
                title={new Date(issue.createdAt).toLocaleString()}>
                {formatDate(issue.createdAt)}
              </time>
            </FormStatus>
            {canDelete && (
              <DeleteIssue
                issue={issue}
                projectHref={`/project/${project.key}`}
                deleteIssue={actions.deleteIssue}
              />
            )}
          </IssueSideFoot>
        </>
      }
    />
  );
}

type FieldProps = { issue: Issue; save: Save };

function TitleEditor({ issue, save }: FieldProps) {
  const errorId = useId();
  const [draft, setDraft] = useState(issue.title);
  const [error, setError] = useState<string>();

  async function submit() {
    if (draft === issue.title) return;
    const { saved, fieldError } = await save({ title: draft });
    setError(fieldError);
    if (saved) setDraft(saved.title);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      setDraft(issue.title);
      setError(undefined);
    }
  }

  return (
    <div>
      <h1 className="sr-only">{issue.title}</h1>
      <IssueTitleInput
        aria-label="Title"
        value={draft}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (!error) void submit();
        }}
      />
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

function Glyph({ children }: { children: ReactNode }) {
  return <span aria-hidden="true">{children}</span>;
}

function StatusField({ issue, editable, save }: FieldProps & { editable: boolean }) {
  const { name, kind } = statuses[issue.status];
  const value = (
    <>
      <Glyph>
        <Status status={kind} />
      </Glyph>
      {name}
    </>
  );
  return (
    <Meta label="Status">
      {editable ? (
        <Picker
          label="Status"
          selectedKey={issue.status}
          value={value}
          onChange={(key) => void save({ status: key as IssueStatus })}>
          {issueStatuses.map((key) => (
            <PickerItem
              key={key}
              id={key}
              textValue={statuses[key].name}>
              <Glyph>
                <Status status={statuses[key].kind} />
              </Glyph>
              {statuses[key].name}
            </PickerItem>
          ))}
        </Picker>
      ) : (
        <PickValue>{value}</PickValue>
      )}
    </Meta>
  );
}

function PriorityField({ issue, editable, save }: FieldProps & { editable: boolean }) {
  const { name, kind } = priorities[issue.priority];
  const value = (
    <>
      <Glyph>
        <Priority priority={kind} />
      </Glyph>
      {name}
    </>
  );
  return (
    <Meta label="Priority">
      {editable ? (
        <Picker
          label="Priority"
          selectedKey={issue.priority}
          value={value}
          empty={issue.priority === "none"}
          onChange={(key) => void save({ priority: key as IssuePriority })}>
          {issuePriorities.map((key) => (
            <PickerItem
              key={key}
              id={key}
              textValue={priorities[key].name}>
              <Glyph>
                <Priority priority={priorities[key].kind} />
              </Glyph>
              {priorities[key].name}
            </PickerItem>
          ))}
        </Picker>
      ) : (
        <PickValue>{value}</PickValue>
      )}
    </Meta>
  );
}

function AssigneesValue({ assignees, me }: { assignees: MemberSummary[]; me?: string }) {
  if (assignees.length === 0) {
    return (
      <>
        <Glyph>
          <Avatar
            size="md"
            empty
          />
        </Glyph>
        Unassigned
      </>
    );
  }
  return (
    <>
      <AvatarStack
        members={assignees}
        me={me}
      />
      <span className="sr-only">{memberNames(assignees)}</span>
    </>
  );
}

function AssigneesField({
  issue,
  members,
  me,
  editable,
  save,
}: FieldProps & { members: MemberSummary[]; me: string; editable: boolean }) {
  const errorId = useId();
  const [error, setError] = useState<string>();
  const selected = issue.assignees.map((member) => member.username);
  const value = (
    <AssigneesValue
      assignees={issue.assignees}
      me={me}
    />
  );

  async function toggle(username: string) {
    const { fieldError } = await save({ assignees: toggled(selected, username) });
    setError(fieldError);
  }

  return (
    <Meta label="Assignees">
      {editable ? (
        <MultiPicker
          label="Assignees"
          selectedKeys={selected}
          value={value}
          empty={selected.length === 0}
          aria-describedby={error ? errorId : undefined}
          onToggle={(key) => void toggle(String(key))}
          search={{ label: "Filter members", placeholder: "Assign to…" }}>
          {assigneeOptions(members, me)}
        </MultiPicker>
      ) : (
        <PickValue>{value}</PickValue>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </Meta>
  );
}

function startDraft({ description, descriptionVersion }: Issue): DescriptionDraft {
  return { text: description, startedFrom: description, version: descriptionVersion };
}

function Description({
  issue,
  members,
  editable,
  updateIssue,
}: {
  issue: Issue;
  members: MemberSummary[];
  editable: boolean;
  updateIssue: IssueActions["updateIssue"];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DescriptionDraft>();
  const [reloading, setReloading] = useState(false);
  const editButton = useReturnFocus<HTMLButtonElement>(draft !== undefined);

  useEffect(() => {
    if (!reloading || issue.descriptionVersion === draft?.version) return;
    setDraft(startDraft(issue));
    setReloading(false);
  }, [reloading, issue, draft?.version]);

  function reload() {
    setReloading(true);
    router.refresh();
  }

  return (
    <IssueSection
      title="Description"
      action={
        editable &&
        !draft && (
          <Button
            ref={editButton}
            variant="quiet"
            size="sm"
            aria-label="Edit description"
            onClick={() => setDraft(startDraft(issue))}>
            Edit
          </Button>
        )
      }>
      {draft ? (
        <DescriptionEditor
          draft={draft}
          members={members}
          onChange={(text) => setDraft({ ...draft, text })}
          onDone={() => setDraft(undefined)}
          onReload={reload}
          save={(description, descriptionVersion) =>
            updateIssue({ id: issue.id, description, descriptionVersion })
          }
        />
      ) : issue.description ? (
        <Markdown
          source={issue.description}
          mentions={issue.mentions}
        />
      ) : (
        <IssueEmpty
          action={editable ? "Add one." : undefined}
          onAction={() => setDraft(startDraft(issue))}>
          No description yet.
        </IssueEmpty>
      )}
    </IssueSection>
  );
}

function LabelsField({
  issue,
  labels,
  projectKey,
  editable,
  save,
  createLabel,
}: FieldProps & {
  labels: Label[];
  projectKey: string;
  editable: boolean;
  createLabel: IssueActions["createLabel"];
}) {
  const router = useRouter();
  const toast = useToast();
  const errorId = useId();
  const [error, setError] = useState<string>();
  const selected = issue.labels.map((label) => label.id);
  const value =
    issue.labels.length > 0
      ? issue.labels.map((label) => (
          <Pill
            key={label.id}
            kind="label">
            {label.name}
          </Pill>
        ))
      : "None";

  async function saveLabels(labelIds: string[]) {
    const { fieldError, refusal } = await save({ labelIds });
    setError(fieldError);
    if (refusal?.kind === "notFound") router.refresh();
  }

  function existing(name: string) {
    return labels.find((label) => label.name.toLowerCase() === name.toLowerCase());
  }

  function createText(input: string) {
    const name = input.trim();
    return name && !existing(name) ? `Create label “${name}”` : undefined;
  }

  async function create(input: string) {
    const result = await createLabel({ key: projectKey, name: input.trim(), color: "gray" }).catch(
      () => undefined,
    );
    if (result?.ok) return saveLabels([...selected, result.data.id]);

    const fieldError = result?.error.kind === "invalid" ? result.error.fields?.name : undefined;
    if (fieldError) setError(fieldError);
    else toast(result ? result.error.message : couldNotSave);
  }

  return (
    <Meta label="Labels">
      {editable ? (
        <MultiPicker
          label="Labels"
          selectedKeys={selected}
          value={value}
          empty={issue.labels.length === 0}
          aria-describedby={error ? errorId : undefined}
          onToggle={(key) =>
            void saveLabels(
              selected.includes(String(key))
                ? selected.filter((id) => id !== key)
                : [...selected, String(key)],
            )
          }
          search={{ label: "Filter or create labels", placeholder: "Filter or create…" }}
          createText={createText}
          onCreate={(input) => void create(input)}
          emptyNote={labels.length === 0 ? "No labels in this project yet." : undefined}>
          {labels.map((label) => (
            <PickerItem
              key={label.id}
              id={label.id}
              textValue={label.name}>
              {label.name}
            </PickerItem>
          ))}
        </MultiPicker>
      ) : (
        <PickValue>{value}</PickValue>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </Meta>
  );
}

type DeleteProps = { issue: Issue; projectHref: string; deleteIssue: IssueActions["deleteIssue"] };

function DeleteIssue(props: DeleteProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div>
      <Button
        variant="danger-outline"
        size="sm"
        aria-haspopup="dialog"
        onClick={() => setConfirming(true)}>
        <Trash2 size={14} />
        Delete issue…
      </Button>
      {confirming && (
        <DeleteDialog
          {...props}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function DeleteDialog({ issue, projectHref, deleteIssue, onCancel }: DeleteProps & { onCancel: () => void }) {
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  async function confirm() {
    setDeleting(true);
    const result = await deleteIssue({ id: issue.id }).catch(() => undefined);
    if (result?.ok) return loadPage(projectHref);

    setDeleting(false);
    toast(result ? result.error.message : couldNotSave);
  }

  return (
    <Dialog
      open
      role="alertdialog"
      title={`Delete ${issue.id}?`}
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
            busy={deleting ? "Deleting…" : undefined}
            aria-busy={deleting || undefined}
            onClick={confirm}>
            Delete issue
          </Button>
        </>
      }>
      {`“${issue.title}” and its comments will be deleted permanently. You can’t undo this.`}
    </Dialog>
  );
}