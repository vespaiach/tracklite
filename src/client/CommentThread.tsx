import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router";
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
} from "../components/ui/track-lite";
import { Markdown } from "../lib/markdown/Markdown";
import {
  type ApiFailure,
  type ThreadComment,
  useCommentsQuery,
  useDeleteCommentMutation,
  useEditCommentMutation,
  useMeQuery,
  usePostCommentMutation,
} from "./api";
import { formatExact, formatUpdated } from "./dates";
import { useFailureToast } from "./failure";
import { LeaveGuard } from "./LeaveGuard";
import { useMentions } from "./useMentions";
import { useShowLoading } from "./useShowLoading";

export function CommentThread({ threadPath, editable }: { threadPath: string; editable: boolean }) {
  const query = useCommentsQuery(threadPath);
  const linked = useLinkedComment(query.data !== undefined);
  const showLoading = useShowLoading(query.isLoading);
  if (query.isError && !query.data) {
    return (
      <SettingsActions>
        <FormStatus>Couldn't load this.</FormStatus>
        <Button
          size="sm"
          onClick={query.refetch}>
          Retry
        </Button>
      </SettingsActions>
    );
  }
  if (!query.data) return showLoading && <FormStatus>Loading…</FormStatus>;
  return (
    <CommentList>
      {query.data.length === 0 && (
        <FormStatus>{editable ? "No comments yet. Write one below." : "No comments yet."}</FormStatus>
      )}
      {query.data.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          editable={editable}
          highlighted={comment.id === linked}
        />
      ))}
      {editable && <CommentBox threadPath={threadPath} />}
    </CommentList>
  );
}

const linkPrefix = "#comment-";

function useLinkedComment(loaded: boolean) {
  const { hash } = useLocation();
  const [highlighted, setHighlighted] = useState<string>();

  useEffect(() => {
    if (!loaded || !hash.startsWith(linkPrefix)) return;
    const id = hash.slice(linkPrefix.length);
    const target = document.getElementById(`comment-${id}`);
    if (!target) return;
    target.scrollIntoView({ block: "center" });
    setHighlighted(id);
    const fade = setTimeout(() => setHighlighted(undefined), 2000);
    return () => clearTimeout(fade);
  }, [loaded, hash]);

  return highlighted;
}

function authorName({ author }: ThreadComment) {
  return author.deactivated ? `${author.fullName} (deactivated)` : author.fullName;
}

function CommentItem({
  comment,
  editable,
  highlighted,
}: {
  comment: ThreadComment;
  editable: boolean;
  highlighted: boolean;
}) {
  const { data: me } = useMeQuery();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const own = me?.username === comment.author.username;
  const canEdit = editable && own;
  const canDelete = editable && (own || me?.role === "admin");

  if (editing) {
    return (
      <EditComment
        comment={comment}
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
          size="sm"
          tone="neutral"
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
            label="Comment options"
            icon={
              <DotsThree
                size={15}
                weight="bold"
              />
            }
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
          onCancel={() => setConfirming(false)}
        />
      )}
    </Comment>
  );
}

function DeleteComment({ comment, onCancel }: { comment: ThreadComment; onCancel: () => void }) {
  const [deleteComment, { isLoading }] = useDeleteCommentMutation();
  const toastFailure = useFailureToast();
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  async function confirm() {
    try {
      await deleteComment(comment.id).unwrap();
    } catch (caught) {
      toastFailure(caught);
      onCancel();
    }
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
            disabled={isLoading}
            aria-busy={isLoading || undefined}
            onClick={confirm}>
            Delete
          </Button>
        </>
      }>
      It’s removed for everyone and can’t be restored.
    </Dialog>
  );
}

function bodyError(failure: ApiFailure) {
  return failure.status === 422 ? (failure.fields?.body ?? failure.message) : undefined;
}

function EditComment({ comment, onDone }: { comment: ThreadComment; onDone: () => void }) {
  const [editComment, { isLoading }] = useEditCommentMutation();
  const toastFailure = useFailureToast();
  const [text, setText] = useState(comment.body);
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState<string>();

  async function save() {
    setError(undefined);
    setConflict(undefined);
    try {
      await editComment({ id: comment.id, body: text, version: comment.version }).unwrap();
      onDone();
    } catch (caught) {
      const failure = caught as ApiFailure;
      const fieldError = bodyError(failure);
      if (fieldError) setError(fieldError);
      else if (failure.status === 409) setConflict(failure.message);
      else toastFailure(failure);
    }
  }

  return (
    <CommentForm
      label="Edit comment (Markdown)"
      text={text}
      onChange={setText}
      onSubmit={save}
      onEscape={onDone}
      saving={isLoading}
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
            disabled={isLoading}
            aria-busy={isLoading || undefined}>
            {isLoading ? "Saving…" : "Save"}
          </Button>
        </SettingsActions>
      }
    />
  );
}

function CommentBox({ threadPath }: { threadPath: string }) {
  const [postComment, { isLoading }] = usePostCommentMutation();
  const toastFailure = useFailureToast();
  const [text, setText] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string>();

  async function post() {
    setError(undefined);
    try {
      await postComment({ threadPath, requestId, body: text }).unwrap();
      setText("");
      setRequestId(crypto.randomUUID());
    } catch (caught) {
      const failure = caught as ApiFailure;
      const fieldError = bodyError(failure);
      if (fieldError) setError(fieldError);
      else toastFailure(failure);
    }
  }

  return (
    <>
      <LeaveGuard
        unsaved={text.trim() !== ""}
        message="You have an unsent comment. Leave anyway?"
      />
      <CommentForm
        label="Comment (Markdown)"
        placeholder="Leave a comment…"
        text={text}
        onChange={setText}
        onSubmit={post}
        saving={isLoading}
        error={error}
        actions={
          <Button
            size="sm"
            variant="primary"
            type="submit"
            disabled={isLoading || text.trim() === ""}
            aria-busy={isLoading || undefined}>
            {isLoading ? "Posting…" : "Post"}
          </Button>
        }
      />
    </>
  );
}

function CommentForm({
  label,
  placeholder,
  text,
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
  const mentions = useMentions({ value: text, onChange });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit();
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
        mono
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
          autoFocus,
        }}
        tools={notice}
        submit={actions}
      />
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </form>
  );
}