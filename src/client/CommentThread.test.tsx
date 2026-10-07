import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  admin,
  alex,
  apiError,
  issue,
  memberOf,
  mockApi,
  networkError,
  never,
  noContent,
  project,
  renderAppAt,
  requestsTo,
  sam,
  summary,
} from "../test/client-app";
import type { Me, Project, ThreadComment } from "./api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Answer = (body: unknown) => Response | Promise<Response>;

const web = project("WEB", "Website");
const archivedWeb = project("WEB", "Website", "2026-10-01T09:00:00.000Z");
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

function mockThread({
  me = sam,
  inProject = web,
  comments = [],
  list,
  post,
  patch,
  remove,
  on = "issue",
}: {
  me?: Me;
  inProject?: Project;
  comments?: ThreadComment[];
  list?: Answer;
  post?: Answer;
  patch?: Answer;
  remove?: Answer;
  on?: "issue" | "project";
} = {}) {
  let current = comments;
  const listPath = on === "issue" ? "/api/issues/WEB-42/comments" : "/api/projects/WEB/comments";
  const routes: Record<string, Answer> = {
    "GET /api/me": () => Response.json(me),
    "GET /api/members": () => Response.json([alex, sam]),
    "GET /api/projects?archived=false": () =>
      Response.json(inProject.archivedAt === null ? [summary(inProject)] : []),
    "GET /api/projects/WEB": () => Response.json(inProject),
    "GET /api/projects/WEB/labels": () => Response.json([]),
    "GET /api/issues/WEB-42": () => Response.json(issue({ archived: inProject.archivedAt !== null })),
    [`GET ${listPath}`]: list ?? (() => Response.json(current)),
    [`POST ${listPath}`]:
      post ??
      ((body) => {
        const { body: text } = body as { body: string };
        const made = comment({
          id: `c-${current.length + 1}`,
          body: text,
          author: memberOf(me),
          createdAt: new Date().toISOString(),
          mentions: text.includes("@alex") ? [memberOf(alex)] : [],
        });
        current = [...current, made];
        return Response.json(made, { status: 201 });
      }),
  };
  for (const each of comments) {
    routes[`PATCH /api/comments/${each.id}`] =
      patch ??
      ((body) => {
        const { body: text } = body as { body: string };
        const edited = { ...each, body: text, version: each.version + 1, editedAt: new Date().toISOString() };
        current = current.map((one) => (one.id === each.id ? edited : one));
        return Response.json(edited);
      });
    routes[`DELETE /api/comments/${each.id}`] =
      remove ??
      (() => {
        current = current.filter((one) => one.id !== each.id);
        return noContent();
      });
  }
  return mockApi(routes);
}

function openIssue() {
  renderAppAt("/issue/WEB-42");
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

it("REQ-032.1: comments on an issue are shown oldest first", async () => {
  mockThread({
    comments: [
      comment({ id: "c-1", body: "Posted at nine", createdAt: minutesAgo(65) }),
      comment({ id: "c-2", body: "Posted at five past", createdAt: minutesAgo(60) }),
    ],
  });
  openIssue();

  await screen.findByText("Posted at nine");
  expect((await shownComments()).map((each) => each.textContent?.includes("nine"))).toEqual([true, false]);
});

it("REQ-032.2: a project's comments are on its details page", async () => {
  mockThread({ on: "project", comments: [comment({ body: "Scope is in the description." })] });
  renderAppAt("/project/WEB/detail");

  expect(await screen.findByText("Scope is in the description.")).toBeTruthy();
  expect(await shownComments()).toHaveLength(1);
});

it("REQ-031.1: a posted comment shows “Sam Lee · just now” with @alex highlighted", async () => {
  const fetchMock = mockThread();
  openIssue();

  await type("Looks good. @alex can you review?");
  post();

  const posted = await commentWith("can you review?");
  expect(within(posted).getByText("Sam Lee")).toBeTruthy();
  expect(within(posted).getByText("just now")).toBeTruthy();
  expect(within(posted).getByText("@alex").getAttribute("title")).toBe("Alex Kim");
  expect(requestsTo(fetchMock, "POST /api/issues/WEB-42/comments")).toEqual([
    { requestId: expect.stringMatching(uuid), body: "Looks good. @alex can you review?" },
  ]);
  expect((await commentBox()).value).toBe("");
});

it("REQ-031.2: Post is disabled while the box is empty or only spaces", async () => {
  mockThread();
  openIssue();

  await commentBox();
  expect((screen.getByRole("button", { name: "Post" }) as HTMLButtonElement).disabled).toBe(true);
  await type("   ");
  expect((screen.getByRole("button", { name: "Post" }) as HTMLButtonElement).disabled).toBe(true);
  await type("Ship it");
  expect((screen.getByRole("button", { name: "Post" }) as HTMLButtonElement).disabled).toBe(false);
});

it("REQ-031.3: a too-long comment shows “Too long (max 10,000)” and keeps the text", async () => {
  mockThread({
    post: () => apiError(422, "Check the highlighted fields", { body: "Too long (max 10,000)" }),
  });
  openIssue();
  const long = "a".repeat(10_001);

  await type(long);
  post();

  expect(await screen.findByText("Too long (max 10,000)")).toBeTruthy();
  expect((await commentBox()).value).toBe(long);
  expect((await commentBox()).getAttribute("aria-invalid")).toBe("true");
});

it("STD-5: Post is disabled and reads “Posting…” while posting", async () => {
  mockThread({ post: never });
  openIssue();

  await type("Verified on staging.");
  post();

  const posting = (await screen.findByRole("button", { name: "Posting…" })) as HTMLButtonElement;
  expect(posting.disabled).toBe(true);
});

it("STD-9: a failed post shows “Couldn't save. Try again.” and keeps the text", async () => {
  const fetchMock = mockThread({ post: networkError });
  openIssue();

  await type("Merged on staging.");
  post();

  expect(await screen.findByText("Couldn't save. Try again.")).toBeTruthy();
  expect((await commentBox()).value).toBe("Merged on staging.");
  post();
  await waitFor(() => expect(requestsTo(fetchMock, "POST /api/issues/WEB-42/comments")).toHaveLength(2));
  const [first, retry] = requestsTo(fetchMock, "POST /api/issues/WEB-42/comments");
  expect(retry.requestId).toBe(first.requestId);
});

it("REQ-033.1: the author's edit is saved with its version and marked “(edited)”", async () => {
  const fetchMock = mockThread({
    comments: [comment({ id: "c-7", body: "Consle output", author: memberOf(sam), version: 2 })],
  });
  openIssue();

  await editTo("Consle output", "Console output");

  const edited = await commentWith("Console output");
  expect(within(edited).getByText("(edited)")).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Edit comment (Markdown)" })).toBeNull();
  expect(requestsTo(fetchMock, "PATCH /api/comments/c-7")).toEqual([{ body: "Console output", version: 2 }]);
});

it("REQ-033: a too-long edit shows the error under the editor and keeps the text", async () => {
  mockThread({
    comments: [comment({ body: "Short note", author: memberOf(sam) })],
    patch: () => apiError(422, "Check the highlighted fields", { body: "Too long (max 10,000)" }),
  });
  openIssue();
  const long = "b".repeat(10_001);

  const editor = await editTo("Short note", long);

  expect(await screen.findByText("Too long (max 10,000)")).toBeTruthy();
  expect(editor.value).toBe(long);
  expect(editor.getAttribute("aria-invalid")).toBe("true");
});

it("REQ-033.3: saving an edit to a deleted comment shows “This comment was deleted” and keeps the text", async () => {
  mockThread({
    comments: [comment({ body: "Typo here", author: memberOf(sam) })],
    patch: () => apiError(404, "This comment was deleted"),
  });
  openIssue();

  const editor = await editTo("Typo here", "Typo fixed");

  expect(await screen.findByText("This comment was deleted")).toBeTruthy();
  expect(editor.value).toBe("Typo fixed");
  expect(screen.getByRole("textbox", { name: "Edit comment (Markdown)" })).toBe(editor);
});

it("STD-8: a conflicting edit shows the server message in the editor", async () => {
  mockThread({
    comments: [comment({ body: "First draft", author: memberOf(sam) })],
    patch: () => apiError(409, "This was changed by Sam Lee. Copy your text and reload."),
  });
  openIssue();

  const editor = await editTo("First draft", "Second draft");

  expect(await screen.findByText("This was changed by Sam Lee. Copy your text and reload.")).toBeTruthy();
  expect(editor.value).toBe("Second draft");
});

it("REQ-033.2: an admin sees Delete but not Edit on someone else's comment", async () => {
  mockThread({ me: admin, comments: [comment({ body: "Alex wrote this" })] });
  openIssue();

  const menu = await openOptions("Alex wrote this");

  expect(within(menu).getByRole("menuitem", { name: "Delete" })).toBeTruthy();
  expect(within(menu).queryByRole("menuitem", { name: "Edit" })).toBeNull();
});

it("REQ-034.1: the author deletes a comment after confirming", async () => {
  const fetchMock = mockThread({
    comments: [
      comment({ id: "c-3", body: "Remove me", author: memberOf(sam) }),
      comment({ body: "Keep me" }),
    ],
  });
  openIssue();

  fireEvent.click(within(await openOptions("Remove me")).getByRole("menuitem", { name: "Delete" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Delete this comment?" });
  expect(within(dialog).getByText("It’s removed for everyone and can’t be restored.")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("Remove me")).toBeTruthy();
  expect(requestsTo(fetchMock, "DELETE /api/comments/c-3")).toEqual([]);

  await deleteConfirmed("Remove me");

  await waitFor(() => expect(screen.queryByText("Remove me")).toBeNull());
  expect(screen.getByText("Keep me")).toBeTruthy();
  expect(requestsTo(fetchMock, "DELETE /api/comments/c-3")).toHaveLength(1);
});

it("REQ-034.2: an admin deletes Alex's comment", async () => {
  const fetchMock = mockThread({ me: admin, comments: [comment({ id: "c-4", body: "Alex's note" })] });
  openIssue();

  await deleteConfirmed("Alex's note");

  await waitFor(() => expect(screen.queryByText("Alex's note")).toBeNull());
  expect(requestsTo(fetchMock, "DELETE /api/comments/c-4")).toHaveLength(1);
});

it("REQ-034.3: a member sees no options on someone else's comment", async () => {
  mockThread({ me: alex, comments: [comment({ body: "Sam's note", author: memberOf(sam) })] });
  openIssue();

  const theirs = await commentWith("Sam's note");

  expect(within(theirs).queryByRole("button", { name: "Comment options" })).toBeNull();
});

it("REQ-034.4: a deactivated author shows “Sam Lee (deactivated)” and an admin can still delete", async () => {
  const fetchMock = mockThread({
    me: priya,
    comments: [comment({ id: "c-5", body: "Old note", author: { ...memberOf(sam), deactivated: true } })],
  });
  openIssue();

  expect(within(await commentWith("Old note")).getByText("Sam Lee (deactivated)")).toBeTruthy();
  await deleteConfirmed("Old note");

  await waitFor(() => expect(requestsTo(fetchMock, "DELETE /api/comments/c-5")).toHaveLength(1));
});

it("REQ-032.3: an archived project's thread has no comment box and no options", async () => {
  mockThread({
    me: admin,
    inProject: archivedWeb,
    comments: [comment({ body: "Archived note", author: memberOf(sam) })],
  });
  openIssue();

  const archived = await commentWith("Archived note");

  expect(within(archived).queryByRole("button", { name: "Comment options" })).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Comment (Markdown)" })).toBeNull();
});

it("REQ-032.4: all 200 comments are shown", async () => {
  mockThread({
    comments: Array.from({ length: 200 }, (_, index) =>
      comment({ id: `c-${index}`, body: `Comment number ${index + 1}` }),
    ),
  });
  openIssue();

  await screen.findByText("Comment number 200");
  expect(await shownComments()).toHaveLength(200);
});

it("STD-7: a failed load shows “Couldn't load this.” with Retry and no comment box", async () => {
  mockThread({ list: () => apiError(500, "Internal error") });
  openIssue();

  const section = await thread();

  expect(await within(section).findByText("Couldn't load this.")).toBeTruthy();
  expect(within(section).getByRole("button", { name: "Retry" })).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Comment (Markdown)" })).toBeNull();
});