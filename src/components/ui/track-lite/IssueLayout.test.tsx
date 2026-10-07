import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Comment, IssueTitleInput } from "./IssueLayout";

afterEach(cleanup);

it("Comment shows “Name · time”, the edited mark and its actions in the head", () => {
  render(
    <Comment
      avatar={<span>SL</span>}
      author="Sam Lee"
      time="2 days ago"
      edited={<span>(edited)</span>}
      actions={<button type="button">Comment options</button>}>
      <p>Console output</p>
    </Comment>,
  );
  const comment = screen.getByRole("article");
  const head = comment.querySelector(".tl-comment__head") as HTMLElement;
  expect(head.textContent).toBe("SLSam Lee·2 days ago(edited)Comment options");
  expect(head.lastElementChild?.classList.contains("tl-comment__actions")).toBe(true);
  expect(comment.querySelector(".tl-prose")).toBeNull();
  expect(screen.getByText("Console output").tagName).toBe("P");
});

it("IssueTitleInput is a wrapping text area that carries its error state", () => {
  render(
    <>
      <IssueTitleInput
        aria-label="Title"
        aria-invalid
        aria-describedby="title-error"
        defaultValue="Fix login button"
      />
      <span id="title-error">Title required</span>
    </>,
  );
  const title = screen.getByRole("textbox", { name: "Title" });
  expect(title.tagName).toBe("TEXTAREA");
  expect(title.classList.contains("tl-issue-title")).toBe(true);
  expect(title.getAttribute("aria-invalid")).toBe("true");
  expect(title.getAttribute("aria-describedby")).toBe("title-error");
});