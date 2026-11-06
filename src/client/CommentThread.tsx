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
import { useToast } from "../components/toast";
import type { ActionError, ActionResult, MemberSummary, ThreadComment } from "../contract";
import { settled } from "./action-result";
import { formatExact, formatUpdated } from "./dates";
import { LeaveGuard } from "./LeaveGuard";
import { useMentions } from "./useMentions";
import { useReturnFocus } from "./useReturnFocus";

type Saved = Promise<ActionResult<unknown>>;

export type CommentActions = {
  postComment: (comment: { requestId: string; body: string }) => Saved;
  editComment: (change: { id: string; body: string; version: number }) => Saved;
  deleteComment: (id: string) => Saved;
};

export type CommentThreadProps = CommentActions & {
  comments: ThreadComment[];
  editable: boolean;
  me: string;
  admin: boolean;
  members: MemberSummary[];
};

type Viewer = Omit<CommentThreadProps, "comments" | "editable">;

export function CommentThread({ comments, editable, ...viewer }: CommentThreadProps) {
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
          viewer={viewer}
        />
      ))}
      {editable && <CommentBox viewer={viewer} />}
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

function CommentItem({
  comment,
  editable,
  highlighted,
  viewer,
}: {
  comment: ThreadComment;
  editable: boolean;
  highlighted: boolean;
  viewer: Viewer;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const options = useReturnFocus<HTMLButtonElement>(editing);
  const own = viewer.me === comment.author.username;
  const canEdit = editable && own;
  const canDelete = editable && (own || viewer.admin);

  if (editing) {
    return (
      <EditComment
        comment={comment}
        viewer={viewer}
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
          deleteComment={viewer.deleteComment}
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
  const [isLoading, setLoading] = useState(false);
  const toast = useToast();
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  async function confirm() {
    setLoading(true);
    const result = await settled(deleteComment(comment.id));
    setLoading(false);
    if (result.ok) return;

    toast(result.error.message);
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

function bodyError(error: ActionError) {
  return error.kind === "invalid" ? (error.fields?.body ?? error.message) : undefined;
}

function EditComment({
  comment,
  viewer,
  onDone,
}: {
  comment: ThreadComment;
  viewer: Viewer;
  onDone: () => void;
}) {
  const [isLoading, setLoading] = useState(false);
  const toast = useToast();
  const [text, setText] = useState(comment.body);
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState<string>();

  async function save() {
    setError(undefined);
    setConflict(undefined);
    setLoading(true);
    const result = await settled(
      viewer.editComment({ id: comment.id, body: text, version: comment.version }),
    );
    setLoading(false);
    if (result.ok) return onDone();

    const fieldError = bodyError(result.error);
    if (fieldError) setError(fieldError);
    else if (result.error.kind === "conflict") setConflict(result.error.message);
    else toast(result.error.message);
  }

  return (
    <CommentForm
      label="Edit comment (Markdown)"
      members={viewer.members}
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

function CommentBox({ viewer }: { viewer: Viewer }) {
  const [isLoading, setLoading] = useState(false);
  const toast = useToast();
  const [text, setText] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string>();

  async function post() {
    setError(undefined);
    setLoading(true);
    const result = await settled(viewer.postComment({ requestId, body: text }));
    setLoading(false);

    if (result.ok) {
      setText("");
      setRequestId(crypto.randomUUID());
    } else {
      const fieldError = bodyError(result.error);
      if (fieldError) setError(fieldError);
      else toast(result.error.message);
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
        members={viewer.members}
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
  members,
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
  members: MemberSummary[];
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