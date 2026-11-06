import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { MemberSummary, ThreadComment } from "../../../../../contract";
import { done, renderForm } from "../../../../../test/forms";
import { ProjectComments, type ProjectCommentsProps } from "./ProjectComments";

afterEach(cleanup);

const alex: MemberSummary = { username: "alex", fullName: "Alex Kim", initials: "AK", deactivated: false };

const scope: ThreadComment = {
  id: "c-1",
  body: "Scope is in the description.",
  author: alex,
  createdAt: "2026-10-01T09:00:00.000Z",
  editedAt: null,
  version: 1,
  mentions: [],
};

it("REQ-032.2, REQ-034.1: a project's comments are on its details page; posting and deleting go to that project", async () => {
  const actions = {
    postComment: vi.fn<ProjectCommentsProps["postComment"]>(async () => done),
    editComment: vi.fn<ProjectCommentsProps["editComment"]>(async () => done),
    deleteComment: vi.fn<ProjectCommentsProps["deleteComment"]>(async () => done),
  };
  renderForm(
    <ProjectComments
      projectKey="WEB"
      comments={[scope]}
      editable
      me="alex"
      admin={false}
      members={[alex]}
      {...actions}
    />,
  );

  const shown = screen.getByText("Scope is in the description.").closest("article") as HTMLElement;
  expect(within(shown).getByText("Alex Kim")).toBeTruthy();

  fireEvent.change(screen.getByRole("textbox", { name: "Comment (Markdown)" }), {
    target: { value: "Kickoff notes" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Post" }));
  await waitFor(() =>
    expect(actions.postComment.mock.calls).toEqual([
      [{ key: "WEB", requestId: expect.any(String), body: "Kickoff notes" }],
    ]),
  );

  fireEvent.click(within(shown).getByRole("button", { name: "Comment options" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
  fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(actions.deleteComment.mock.calls).toEqual([[{ id: "c-1" }]]));
});