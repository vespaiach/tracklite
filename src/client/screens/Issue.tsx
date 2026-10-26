import { Trash2 } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
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
} from "../../components/ui/track-lite";
import { Markdown } from "../../lib/markdown/Markdown";
import {
  type ApiFailure,
  type Issue,
  type IssueChange,
  type IssuePriority,
  type IssueStatus,
  type MemberSummary,
  type Project,
  useCreateLabelMutation,
  useDeleteIssueMutation,
  useIssueQuery,
  useLabelsQuery,
  useLazyIssueQuery,
  useMeQuery,
  useMembersQuery,
  useUpdateIssueMutation,
} from "../api";
import { CommentThread } from "../CommentThread";
import { formatDate } from "../dates";
import { type DescriptionDraft, DescriptionEditor } from "../DescriptionEditor";
import { useFailureToast } from "../failure";
import { assigneeOptions, memberNames, toggled } from "../IssueCells";
import { issuePriorities, issueStatuses } from "../../contract";
import { priorities, statuses } from "../issue-fields";
import { LoadFailed, Loading } from "../LoadStates";
import { ProjectGate } from "../ProjectGate";
import { ProjectHeader } from "../ProjectHeader";
import { useShowLoading } from "../useShowLoading";
import { useReturnFocus } from "../useReturnFocus";
import { NotFound } from "./NotFound";

export function IssuePage() {
  const { id = "" } = useParams();
  const { search, hash } = useLocation();
  const canonical = id.toUpperCase();
  if (id !== canonical) {
    return (
      <Navigate
        to={{ pathname: `/issue/${canonical}`, search, hash }}
        replace
      />
    );
  }
  return <IssueGate id={canonical} />;
}

function IssueGate({ id }: { id: string }) {
  const query = useIssueQuery(id);
  const { data: me } = useMeQuery();
  if ((query.error as ApiFailure | undefined)?.status === 404) return <NotFound />;
  return (
    <ProjectGate projectKey={id.split("-")[0]}>
      {(project) => (
        <>
          <ProjectHeader
            project={project}
            issue={query.data ?? { id }}
            admin={me?.role === "admin"}
          />
          <IssueLoad
            query={query}
            project={project}
          />
        </>
      )}
    </ProjectGate>
  );
}

function IssueLoad({ query, project }: { query: ReturnType<typeof useIssueQuery>; project: Project }) {
  const showLoading = useShowLoading(query.isLoading);
  if (query.isError) return <LoadFailed onRetry={query.refetch} />;
  if (!query.data) return <Loading show={showLoading} />;
  return (
    <IssueView
      issue={query.data}
      project={project}
    />
  );
}

function useIssueSave(id: string) {
  const [updateIssue] = useUpdateIssueMutation();
  const toastFailure = useFailureToast();
  return async (change: IssueChange): Promise<{ saved?: Issue; fieldError?: string }> => {
    try {
      return { saved: await updateIssue({ id, change }).unwrap() };
    } catch (caught) {
      const failure = caught as ApiFailure;
      const fieldError = failure.status === 422 ? Object.values(failure.fields ?? {})[0] : undefined;
      if (!fieldError) toastFailure(failure);
      return { fieldError };
    }
  };
}

function IssueView({ issue, project }: { issue: Issue; project: Project }) {
  const { data: me } = useMeQuery();
  const editable = !issue.archived;
  const canDelete = editable && (me?.role === "admin" || me?.username === issue.createdBy.username);
  return (
    <IssueLayout
      title={editable ? <TitleEditor issue={issue} /> : <IssueTitle>{issue.title}</IssueTitle>}
      main={
        <>
          <Description
            issue={issue}
            editable={editable}
          />
          <IssueSection title="Comments">
            <CommentThread
              threadPath={`issues/${issue.id}/comments`}
              editable={editable}
            />
          </IssueSection>
        </>
      }
      side={
        <>
          <StatusField
            issue={issue}
            editable={editable}
          />
          <PriorityField
            issue={issue}
            editable={editable}
          />
          <AssigneesField
            issue={issue}
            me={me?.username}
            editable={editable}
          />
          <LabelsField
            issue={issue}
            projectKey={project.key}
            editable={editable}
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
              />
            )}
          </IssueSideFoot>
        </>
      }
    />
  );
}

function TitleEditor({ issue }: { issue: Issue }) {
  const save = useIssueSave(issue.id);
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

function StatusField({ issue, editable }: { issue: Issue; editable: boolean }) {
  const save = useIssueSave(issue.id);
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

function PriorityField({ issue, editable }: { issue: Issue; editable: boolean }) {
  const save = useIssueSave(issue.id);
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

function AssigneesField({ issue, me, editable }: { issue: Issue; me?: string; editable: boolean }) {
  const save = useIssueSave(issue.id);
  const { data: members } = useMembersQuery(undefined, { skip: !editable });
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
      {editable && members ? (
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

function Description({ issue, editable }: { issue: Issue; editable: boolean }) {
  const [draft, setDraft] = useState<DescriptionDraft>();
  const editButton = useReturnFocus<HTMLButtonElement>(draft !== undefined);
  const [updateIssue] = useUpdateIssueMutation();
  const [loadIssue] = useLazyIssueQuery();

  async function reload() {
    setDraft(startDraft(await loadIssue(issue.id).unwrap()));
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
          onChange={(text) => setDraft({ ...draft, text })}
          onDone={() => setDraft(undefined)}
          onReload={() => void reload()}
          save={(description, descriptionVersion) =>
            updateIssue({ id: issue.id, change: { description, descriptionVersion } }).unwrap()
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
  projectKey,
  editable,
}: {
  issue: Issue;
  projectKey: string;
  editable: boolean;
}) {
  const save = useIssueSave(issue.id);
  const { data: labels } = useLabelsQuery(projectKey, { skip: !editable });
  const [createLabel] = useCreateLabelMutation();
  const toastFailure = useFailureToast();
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
    const { fieldError } = await save({ labelIds });
    setError(fieldError);
  }

  function existing(name: string) {
    return labels?.find((label) => label.name.toLowerCase() === name.toLowerCase());
  }

  function createText(input: string) {
    const name = input.trim();
    return name && !existing(name) ? `Create label “${name}”` : undefined;
  }

  async function create(input: string) {
    try {
      const made = await createLabel({ key: projectKey, name: input.trim(), color: "gray" }).unwrap();
      await saveLabels([...selected, made.id]);
    } catch (caught) {
      const failure = caught as ApiFailure;
      const fieldError = failure.status === 422 ? failure.fields?.name : undefined;
      if (fieldError) setError(fieldError);
      else toastFailure(failure);
    }
  }

  return (
    <Meta label="Labels">
      {editable && labels ? (
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

function DeleteIssue({ issue, projectHref }: { issue: Issue; projectHref: string }) {
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
          issue={issue}
          projectHref={projectHref}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function DeleteDialog({
  issue,
  projectHref,
  onCancel,
}: {
  issue: Issue;
  projectHref: string;
  onCancel: () => void;
}) {
  const [deleteIssue, { isLoading }] = useDeleteIssueMutation();
  const toastFailure = useFailureToast();
  const navigate = useNavigate();
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  async function confirm() {
    try {
      await deleteIssue(issue.id).unwrap();
      await navigate(projectHref);
    } catch (caught) {
      toastFailure(caught);
    }
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
            busy={isLoading ? "Deleting…" : undefined}
            aria-busy={isLoading || undefined}
            onClick={confirm}>
            Delete issue
          </Button>
        </>
      }>
      {`“${issue.title}” and its comments will be deleted permanently. You can’t undo this.`}
    </Dialog>
  );
}