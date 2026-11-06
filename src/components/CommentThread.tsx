"use client";

import { Ellipsis } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { formatExact, formatUpdated } from "../client/dates";
import { useReturnFocus } from "../client/useReturnFocus";
import type { ActionError, ActionResult, MemberSummary, ThreadComment } from "../contract";
import { Markdown } from "../lib/markdown/Markdown";
import { useLeaveGuard } from "./leave-guard";
import { useToast } from "./toast";
import {
  Avatar,
  Button,
  Comment,
  CommentList,
  Dialog,
  Editor,
  FieldError,
  FormStatus,
  Menu,
  MenuItem,
  SettingsActions,
} from "./ui/track-lite";
import { useMentions } from "./useMentions";
import { useRequestId } from "./useRequestId";

type Outcome = Promise<ActionResult<unknown>>;

export type CommentActions = {
  postComment: (comment: { id: string; requestId: string; body: string }) => Outcome;
  editComment: (edit: { id: string; body: string; version: number }) => Outcome;
  deleteComment: (comment: { id: string }) => Outcome;
};

export type CommentThreadProps = CommentActions & {
  threadId: string;
  comments: ThreadComment[];
  me: { username: string; admin: boolean };
  members: MemberSummary[];
  editable: boolean;
};

const couldNotSave = "Couldn’t save. Try again.";

function bodyError({ kind, message, fields }: ActionError) {
  return kind === "invalid" ? (fields?.body ?? message) : undefined;
}

export function CommentThread({ threadId, comments, editable, ...shared }: CommentThreadProps) {
  const linked = useLinkedComment();
  return (
    <CommentList>
      {comments.length === 0 && (
        <FormStatus>{editable ? "No comments yet. Write one below." : "No comments yet."}</FormStatus>
      )}
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          editable={editable}
          highlighted={comment.id === linked}
          {...shared}
        />
      ))}
      {editable && (
        <CommentBox
          threadId={threadId}
          members={shared.members}
          postComment={shared.postComment}
        />
      )}
    </CommentList>
  );
}

const linkPrefix = "#comment-";

function useLinkedComment() {
  const [highlighted, setHighlighted] = useState<string>();

  useEffect(() => {
    const { hash } = window.location;
    if (!hash.startsWith(linkPrefix)) return;
    const id = hash.slice(linkPrefix.length);
    const target = document.getElementById(`comment-${id}`);
    if (!target) return;

    target.scrollIntoView({ block: "center" });
    setHighlighted(id);
    const fade = setTimeout(() => setHighlighted(undefined), 2000);
    return () => clearTimeout(fade);
  }, []);

  return highlighted;
}

function authorName({ author }: ThreadComment) {
  return author.deactivated ? `${author.fullName} (deactivated)` : author.fullName;
}

type CommentItemProps = Omit<CommentThreadProps, "threadId" | "comments"> & {
  comment: ThreadComment;
  highlighted: boolean;
};

function CommentItem({
  comment,
  editable,
  highlighted,
  me,
  members,
  editComment,
  deleteComment,
}: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const options = useReturnFocus<HTMLButtonElement>(editing);
  const own = me.username === comment.author.username;
  const canEdit = editable && own;
  const canDelete = editable && (own || me.admin);

  if (editing) {
    return (
      <EditComment
        comment={comment}
        members={members}
        editComment={editComment}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <Comment
      id={`comment-${comment.id}`}
      highlighted={highlighted}
      avatar={
        <Avatar
          size="md"
          tone={own ? "accent" : "neutral"}
          initials={comment.author.initials}
        />
      }
      author={authorName(comment)}
      time={
        <time
          dateTime={comment.createdAt}
          title={formatExact(comment.createdAt)}>
          {formatUpdated(comment.createdAt)}
        </time>
      }
      edited={comment.editedAt && <span title={`Edited ${formatExact(comment.editedAt)}`}>(edited)</span>}
      actions={
        canDelete && (
          <Menu
            ref={options}
            label="Comment options"
            icon={<Ellipsis size={15} />}
            onAction={(key) => (key === "edit" ? setEditing(true) : setConfirming(true))}>
            {canEdit && <MenuItem id="edit">Edit</MenuItem>}
            <MenuItem
              id="delete"
              danger>
              Delete
            </MenuItem>
          </Menu>
        )
      }>
      <Markdown
        source={comment.body}
        mentions={comment.mentions}
      />
      {confirming && (
        <DeleteComment
          comment={comment}
          deleteComment={deleteComment}
          onCancel={() => setConfirming(false)}
        />
      )}
    </Comment>
  );
}

function DeleteComment({
  comment,
  deleteComment,
  onCancel,
}: {
  comment: ThreadComment;
  deleteComment: CommentActions["deleteComment"];
  onCancel: () => void;
}) {
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  async function confirm() {
    setDeleting(true);
    const result = await deleteComment({ id: comment.id }).catch(() => undefined);
    if (result?.ok) return;

    setDeleting(false);
    toast(result ? result.error.message : couldNotSave);
    onCancel();
  }

  return (
    <Dialog
      open
      role="alertdialog"
      title="Delete this comment?"
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
            disabled={deleting}
            aria-busy={deleting || undefined}
            onClick={confirm}>
            Delete
          </Button>
        </>
      }>
      It’s removed for everyone and can’t be restored.
    </Dialog>
  );
}

function EditComment({
  comment,
  members,
  editComment,
  onDone,
}: {
  comment: ThreadComment;
  members: MemberSummary[];
  editComment: CommentActions["editComment"];
  onDone: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState(comment.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState<string>();

  async function save() {
    setError(undefined);
    setConflict(undefined);
    setSaving(true);

    const result = await editComment({ id: comment.id, body: text, version: comment.version }).catch(
      () => undefined,
    );
    setSaving(false);
    if (!result) return toast(couldNotSave);
    if (result.ok) return onDone();

    const fieldError = bodyError(result.error);
    if (fieldError) setError(fieldError);
    else if (result.error.kind === "conflict") setConflict(result.error.message);
    else toast(result.error.message);
  }

  return (
    <CommentForm
      label="Edit comment (Markdown)"
      text={text}
      members={members}
      onChange={setText}
      onSubmit={save}
      onEscape={onDone}
      saving={saving}
      error={error}
      notice={
        conflict && (
          <div role="alert">
            <FieldError>{conflict}</FieldError>
          </div>
        )
      }
      autoFocus
      actions={
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
  );
}

function CommentBox({
  threadId,
  members,
  postComment,
}: {
  threadId: string;
  members: MemberSummary[];
  postComment: CommentActions["postComment"];
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [requestId, renewRequestId] = useRequestId();
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string>();
  useLeaveGuard(text.trim() !== "" ? "You have an unsent comment. Leave anyway?" : null);

  async function post() {
    setError(undefined);
    setPosting(true);

    const result = await postComment({ id: threadId, requestId, body: text }).catch(() => undefined);
    setPosting(false);
    if (!result) return toast(couldNotSave);
    if (result.ok) {
      setText("");
      renewRequestId();
      return;
    }

    const fieldError = bodyError(result.error);
    if (fieldError) setError(fieldError);
    else toast(result.error.message);
  }

  return (
    <CommentForm
      label="Comment (Markdown)"
      placeholder="Leave a comment…"
      text={text}
      members={members}
      onChange={setText}
      onSubmit={post}
      saving={posting}
      error={error}
      actions={
        <Button
          size="sm"
          variant="primary"
          type="submit"
          disabled={posting || text.trim() === ""}
          aria-busy={posting || undefined}>
          {posting ? "Posting…" : "Post"}
        </Button>
      }
    />
  );
}

function CommentForm({
  label,
  placeholder,
  text,
  members,
  onChange,
  onSubmit,
  onEscape,
  saving,
  error,
  notice,
  autoFocus,
  actions,
}: {
  label: string;
  placeholder?: string;
  text: string;
  members: MemberSummary[];
  onChange: (text: string) => void;
  onSubmit: () => Promise<void>;
  onEscape?: () => void;
  saving: boolean;
  error?: string;
  notice?: ReactNode;
  autoFocus?: boolean;
  actions: ReactNode;
}) {
  const errorId = useId();
  const mentions = useMentions({ value: text, onChange, members });
  const textarea = mentions.textarea.ref;

  useEffect(() => {
    if (autoFocus) textarea.current?.focus();
  }, [autoFocus, textarea]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit();
    textarea.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    mentions.textarea.onKeyDown(event);
    if (event.key === "Escape" && !event.defaultPrevented) onEscape?.();
  }

  return (
    <form
      noValidate
      onSubmit={submit}>
      <Editor
        invalid={Boolean(error)}
        value={text}
        onChange={mentions.onChange}
        overlay={mentions.list}
        placeholder={placeholder}
        textarea={{
          ...mentions.textarea,
          onKeyDown,
          "aria-label": label,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": error ? errorId : undefined,
          readOnly: saving,
        }}
        tools={notice}
        submit={actions}
      />
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </form>
  );
}