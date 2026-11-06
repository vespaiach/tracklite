import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { formatExact } from "../client/dates";
import type { ActionResult, Me, ThreadComment } from "../contract";
import { admin, alex, memberOf, sam } from "../test/client-app";
import { done, renderForm } from "../test/forms";
import { CommentThread } from "./CommentThread";
import { Link } from "./leave-guard";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("next/link", () => ({
  default: ({
    href,
    onNavigate,
    children,
  }: {
    href: string;
    onNavigate: (event: { preventDefault: () => void }) => void;
    children: ReactNode;
  }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        let prevented = false;
        onNavigate({ preventDefault: () => (prevented = true) });
        if (!prevented) navigate(href);
      }}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  navigate.mockClear();
  window.history.replaceState(null, "", "/");
});

type Answer = ActionResult<unknown> | Promise<ActionResult<unknown>>;
type Post = { id: string; requestId: string; body: string };
type Edit = { id: string; body: string; version: number };

const priya: Me = { ...alex, username: "priya", fullName: "Priya Shah", initials: "PS", role: "admin" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function comment(overrides: Partial<ThreadComment> = {}): ThreadComment {
  return {
    id: "c-1",
    body: "Reproduced on Safari 17.4.",
    author: memberOf(alex),
    createdAt: minutesAgo(180),
    editedAt: null,
    version: 1,
    mentions: [],
    ...overrides,
  };
}

function refusal(kind: string, message: string, fields?: Record<string, string>) {
  return { ok: false, error: { kind, message, ...(fields ? { fields } : {}) } } as ActionResult<unknown>;
}

function invalidBody(message: string) {
  return refusal("invalid", "Check the highlighted fields", { body: message });
}

function renderThread({
  me = sam,
  editable = true,
  comments = [],
  post,
  edit,
  remove,
}: {
  me?: Me;
  editable?: boolean;
  comments?: ThreadComment[];
  post?: (comment: Post) => Answer;
  edit?: (edit: Edit) => Answer;
  remove?: () => Answer;
} = {}) {
  const server = { comments };
  const page = { refresh: () => {} };

  async function answered(answer: Answer) {
    const result = await answer;
    if (result.ok) page.refresh();
    return result;
  }

  function posted({ body }: Post) {
    const made = comment({
      id: `c-${server.comments.length + 1}`,
      body,
      author: memberOf(me),
      createdAt: new Date().toISOString(),
      mentions: body.includes("@alex") ? [memberOf(alex)] : [],
    });
    server.comments = [...server.comments, made];
    return { ok: true, data: made } as const;
  }

  function edited({ id, body }: Edit) {
    server.comments = server.comments.map((one) =>
      one.id === id ? { ...one, body, version: one.version + 1, editedAt: new Date().toISOString() } : one,
    );
    return done;
  }

  const postComment = vi.fn(async (input: Post) => answered(post ? post(input) : posted(input)));
  const editComment = vi.fn(async (input: Edit) => answered(edit ? edit(input) : edited(input)));
  const deleteComment = vi.fn(async ({ id }: { id: string }) => {
    if (remove) return answered(remove());
    server.comments = server.comments.filter((one) => one.id !== id);
    return answered(done);
  });

  function RefreshingThread() {
    const [, setRefreshes] = useState(0);
    page.refresh = () => setRefreshes((count) => count + 1);
    return (
      <section aria-label="Comments">
        <CommentThread
          threadId="WEB-42"
          comments={server.comments}
          me={{ username: me.username, admin: me.role === "admin" }}
          members={[alex, sam]}
          editable={editable}
          postComment={postComment}
          editComment={editComment}
          deleteComment={deleteComment}
        />
        <Link href="/project/WEB">Website · WEB</Link>
      </section>
    );
  }

  renderForm(<RefreshingThread />);
  return { postComment, editComment, deleteComment };
}

function sent<Input extends { id: string }>(action: { mock: { calls: [Input][] } }) {
  return action.mock.calls.map(([input]) => input);
}

async function thread() {
  return screen.findByRole("region", { name: "Comments" });
}

async function shownComments() {
  return within(await thread()).queryAllByRole("article");
}

async function commentBox() {
  return (await screen.findByRole("textbox", { name: "Comment (Markdown)" })) as HTMLTextAreaElement;
}

async function type(text: string) {
  fireEvent.change(await commentBox(), { target: { value: text } });
}

function post() {
  fireEvent.click(screen.getByRole("button", { name: "Post" }));
}

async function commentWith(text: string) {
  return waitFor(() => {
    const found = screen.queryAllByRole("article").find((article) => article.textContent?.includes(text));
    if (!found) throw new Error(`No comment containing “${text}”`);
    return found;
  });
}

async function openOptions(text: string) {
  fireEvent.click(within(await commentWith(text)).getByRole("button", { name: "Comment options" }));
  return screen.findByRole("menu");
}

async function startEditing(text: string) {
  fireEvent.click(within(await openOptions(text)).getByRole("menuitem", { name: "Edit" }));
  return (await screen.findByRole("textbox", { name: "Edit comment (Markdown)" })) as HTMLTextAreaElement;
}

async function editTo(text: string, next: string) {
  const editor = await startEditing(text);
  fireEvent.change(editor, { target: { value: next } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  return editor;
}

async function deleteConfirmed(text: string) {
  fireEvent.click(within(await openOptions(text)).getByRole("menuitem", { name: "Delete" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Delete this comment?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
}

function projectLink() {
  return screen.getByRole("link", { name: "Website · WEB" });
}

it("REQ-032.1: comments on an issue are shown oldest first", async () => {
  renderThread({
    comments: [
      comment({ id: "c-1", body: "Posted at nine", createdAt: minutesAgo(65) }),
      comment({ id: "c-2", body: "Posted at five past", createdAt: minutesAgo(60) }),
    ],
  });

  await screen.findByText("Posted at nine");
  expect((await shownComments()).map((each) => each.textContent?.includes("nine"))).toEqual([true, false]);
});

it("REQ-031.1: a posted comment shows “Sam Lee · just now” with @alex highlighted", async () => {
  const actions = renderThread();

  await type("Looks good. @alex can you review?");
  post();

  const posted = await commentWith("can you review?");
  expect(within(posted).getByText("Sam Lee")).toBeTruthy();
  expect(within(posted).getByText("just now")).toBeTruthy();
  expect(within(posted).getByText("@alex").getAttribute("title")).toBe("Alex Kim");
  expect(sent(actions.postComment)).toEqual([
    { id: "WEB-42", requestId: expect.stringMatching(uuid), body: "Looks good. @alex can you review?" },
  ]);
  expect((await commentBox()).value).toBe("");
});

it("REQ-031.2: Post is disabled while the box is empty or only spaces", async () => {
  renderThread();

  await commentBox();
  expect((screen.getByRole("button", { name: "Post" }) as HTMLButtonElement).disabled).toBe(true);
  await type("   ");
  expect((screen.getByRole("button", { name: "Post" }) as HTMLButtonElement).disabled).toBe(true);
  await type("Ship it");
  expect((screen.getByRole("button", { name: "Post" }) as HTMLButtonElement).disabled).toBe(false);
});

it("REQ-031.3: a too-long comment shows “Too long (max 10,000)” and keeps the text", async () => {
  renderThread({
    post: () => invalidBody("Too long (max 10,000)"),
  });
  const long = "a".repeat(10_001);

  await type(long);
  post();

  expect(await screen.findByText("Too long (max 10,000)")).toBeTruthy();
  expect((await commentBox()).value).toBe(long);
  expect((await commentBox()).getAttribute("aria-invalid")).toBe("true");
});

it("STD-5, STD-9: a failed post keeps the text; the retry reuses the requestId and shows Posting… disabled", async () => {
  const answers = [
    () => Promise.reject(new TypeError("Failed to fetch")),
    () => new Promise<ActionResult<unknown>>(() => {}),
  ];
  const actions = renderThread({ post: () => (answers.shift() as () => Answer)() });

  await type("Merged on staging.");
  post();

  expect(await screen.findByText("Couldn’t save. Try again.")).toBeTruthy();
  expect((await commentBox()).value).toBe("Merged on staging.");

  post();

  const posting = (await screen.findByRole("button", { name: "Posting…" })) as HTMLButtonElement;
  expect(posting.disabled).toBe(true);
  await waitFor(() => expect(actions.postComment).toHaveBeenCalledTimes(2));
  const [first, retry] = sent(actions.postComment);
  expect(retry.requestId).toBe(first.requestId);
});

it("REQ-033.1: the author's edit is saved with its version and marked “(edited)”", async () => {
  const actions = renderThread({
    comments: [comment({ id: "c-7", body: "Consle output", author: memberOf(sam), version: 2 })],
  });

  await editTo("Consle output", "Console output");

  const edited = await commentWith("Console output");
  expect(within(edited).getByText("(edited)")).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Edit comment (Markdown)" })).toBeNull();
  expect(sent(actions.editComment)).toEqual([{ id: "c-7", body: "Console output", version: 2 }]);
});

it("REQ-033, REQ-033.3, STD-8: a failed edit save shows the server's message under the editor and keeps the text", async () => {
  const answers = [
    invalidBody("Too long (max 10,000)"),
    refusal("conflict", "This was changed by Sam Lee. Copy your text and reload."),
    refusal("notFound", "This comment was deleted"),
  ];
  renderThread({
    comments: [comment({ body: "Short note", author: memberOf(sam) })],
    edit: () => answers.shift() as ActionResult<unknown>,
  });
  const long = "b".repeat(10_001);

  const editor = await editTo("Short note", long);

  expect(await screen.findByText("Too long (max 10,000)")).toBeTruthy();
  expect(editor.value).toBe(long);
  expect(editor.getAttribute("aria-invalid")).toBe("true");

  fireEvent.change(editor, { target: { value: "Second draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("This was changed by Sam Lee. Copy your text and reload.")).toBeTruthy();
  expect(editor.value).toBe("Second draft");

  fireEvent.change(editor, { target: { value: "Typo fixed" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("This comment was deleted")).toBeTruthy();
  expect(editor.value).toBe("Typo fixed");
  expect(screen.getByRole("textbox", { name: "Edit comment (Markdown)" })).toBe(editor);
});

it("REQ-033.2, REQ-034.2, REQ-034.4: an admin can delete but not edit others' comments, including a deactivated author's", async () => {
  const actions = renderThread({
    me: priya,
    comments: [
      comment({ id: "c-4", body: "Alex's note" }),
      comment({ id: "c-5", body: "Old note", author: { ...memberOf(sam), deactivated: true } }),
    ],
  });

  const menu = await openOptions("Alex's note");
  expect(within(menu).queryByRole("menuitem", { name: "Edit" })).toBeNull();
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Delete" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Delete this comment?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

  await waitFor(() => expect(screen.queryByText("Alex's note")).toBeNull());
  expect(sent(actions.deleteComment)).toEqual([{ id: "c-4" }]);

  expect(within(await commentWith("Old note")).getByText("Sam Lee (deactivated)")).toBeTruthy();
  await deleteConfirmed("Old note");

  await waitFor(() => expect(sent(actions.deleteComment)).toEqual([{ id: "c-4" }, { id: "c-5" }]));
});

it("REQ-034.1: the author deletes a comment after confirming", async () => {
  const actions = renderThread({
    comments: [
      comment({ id: "c-3", body: "Remove me", author: memberOf(sam) }),
      comment({ body: "Keep me" }),
    ],
  });

  fireEvent.click(within(await openOptions("Remove me")).getByRole("menuitem", { name: "Delete" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Delete this comment?" });
  expect(within(dialog).getByText("It’s removed for everyone and can’t be restored.")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("Remove me")).toBeTruthy();
  expect(actions.deleteComment).not.toHaveBeenCalled();

  await deleteConfirmed("Remove me");

  await waitFor(() => expect(screen.queryByText("Remove me")).toBeNull());
  expect(screen.getByText("Keep me")).toBeTruthy();
  expect(sent(actions.deleteComment)).toEqual([{ id: "c-3" }]);
});

it("REQ-034.3: a member sees no options on someone else's comment", async () => {
  renderThread({ me: alex, comments: [comment({ body: "Sam's note", author: memberOf(sam) })] });

  const theirs = await commentWith("Sam's note");

  expect(within(theirs).queryByRole("button", { name: "Comment options" })).toBeNull();
});

it("REQ-032.3: an archived project's thread has no comment box and no options", async () => {
  renderThread({
    me: admin,
    editable: false,
    comments: [comment({ body: "Archived note", author: memberOf(sam) })],
  });

  const archived = await commentWith("Archived note");

  expect(within(archived).queryByRole("button", { name: "Comment options" })).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Comment (Markdown)" })).toBeNull();
});

it("REQ-032.4: all 200 comments are shown", async () => {
  renderThread({
    comments: Array.from({ length: 200 }, (_, index) =>
      comment({ id: `c-${index}`, body: `Comment number ${index + 1}` }),
    ),
  });

  await screen.findByText("Comment number 200");
  expect(await shownComments()).toHaveLength(200);
});

it("REQ-035.1: leaving with an unsent comment asks first; Cancel keeps the text", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  renderThread();
  await type("Half a thought");

  fireEvent.click(projectLink());

  expect(confirm).toHaveBeenCalledWith("You have an unsent comment. Leave anyway?");
  expect(navigate).not.toHaveBeenCalled();
  expect((await commentBox()).value).toBe("Half a thought");
});

it("REQ-035: closing the tab with an unsent comment asks the browser to confirm", async () => {
  renderThread();
  await commentBox();

  const empty = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(empty);
  expect(empty.defaultPrevented).toBe(false);

  await type("Half a thought");
  const typed = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(typed);
  expect(typed.defaultPrevented).toBe(true);
});

it("REQ-035.2, REQ-035: a posted comment or a blank box doesn't hold back leaving", async () => {
  renderThread();
  await type("Verified on staging.");
  post();
  await commentWith("Verified on staging.");
  await type("   ");
  const confirm = vi.spyOn(window, "confirm");

  fireEvent.click(projectLink());

  expect(confirm).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith("/project/WEB");
});

it("REQ-031, REQ-033: hovering the time or “(edited)” shows the exact time", async () => {
  const createdAt = minutesAgo(180);
  const editedAt = minutesAgo(20);
  renderThread({ comments: [comment({ body: "Console output", createdAt, editedAt })] });

  const shown = await commentWith("Console output");
  expect(within(shown).getByText("3 hours ago").getAttribute("title")).toBe(formatExact(createdAt));
  expect(within(shown).getByText("(edited)").getAttribute("title")).toBe(`Edited ${formatExact(editedAt)}`);
});

it("§6.1: an address ending in #comment-{id} scrolls to that comment and highlights it briefly", async () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  window.history.replaceState(null, "", "/issue/WEB-42#comment-c-7");
  renderThread({
    comments: [comment({ id: "c-1", body: "First" }), comment({ id: "c-7", body: "Linked from email" })],
  });

  const linked = await commentWith("Linked from email");
  expect(linked.id).toBe("comment-c-7");
  await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
  expect(scrollIntoView.mock.contexts[0]).toBe(linked);
  expect(linked.classList.contains("tl-comment--highlighted")).toBe(true);
  await waitFor(() => expect(linked.classList.contains("tl-comment--highlighted")).toBe(false), {
    timeout: 3000,
  });
});

it("§6.1: a #comment-{id} for a comment that's gone leaves the page at the top", async () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  window.history.replaceState(null, "", "/issue/WEB-42#comment-c-9");
  renderThread({ comments: [comment({ id: "c-1", body: "First" })] });

  await commentWith("First");
  expect(scrollIntoView).not.toHaveBeenCalled();
  expect(document.querySelector(".tl-comment--highlighted")).toBeNull();
});

it("NFR-007: Edit moves focus into the comment editor; Escape and Save return it to Comment options", async () => {
  renderThread({ comments: [comment({ body: "Short note", author: memberOf(sam) })] });

  const escaping = await startEditing("Short note");
  await waitFor(() => expect(document.activeElement).toBe(escaping));
  fireEvent.keyDown(escaping, { key: "Escape" });
  await waitFor(() =>
    expect(document.activeElement).toBe(
      within(screen.getByRole("article")).getByRole("button", { name: "Comment options" }),
    ),
  );

  const saving = await editTo("Short note", "Longer note");
  await waitFor(() => expect(document.activeElement).toBe(saving));
  await waitFor(() =>
    expect(document.activeElement).toBe(
      within(screen.getByRole("article")).getByRole("button", { name: "Comment options" }),
    ),
  );
});

it("NFR-007: focus stays in the comment box after Post", async () => {
  renderThread();

  await type("Ship it");
  screen.getByRole("button", { name: "Post" }).focus();
  post();

  await commentWith("Ship it");
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Comment (Markdown)" })),
  );
});