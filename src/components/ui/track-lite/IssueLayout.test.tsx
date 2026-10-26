import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Comment, EditorNotice, IssueEmpty, IssueLayout, IssueTitleInput } from "./IssueLayout";

afterEach(cleanup);

it("Comment shows the name, time, the edited mark and its actions in the head; IssueTitleInput is a wrapping text area that carries its error state", () => {
  render(
    <>
      <Comment
        avatar={<span>SL</span>}
        author="Sam Lee"
        time="2 days ago"
        edited={<span>(edited)</span>}
        actions={<button type="button">Comment options</button>}>
        <p>Console output</p>
      </Comment>
      <IssueTitleInput
        aria-label="Title"
        aria-invalid
        aria-describedby="title-error"
        defaultValue="Fix login button"
      />
      <span id="title-error">Title required</span>
    </>,
  );

  const comment = screen.getByRole("article");
  const head = comment.querySelector(".tl-comment__head") as HTMLElement;
  expect(head.textContent).toBe("SLSam Lee2 days ago(edited)Comment options");
  expect(head.lastElementChild?.classList.contains("tl-comment__actions")).toBe(true);
  expect(comment.querySelector(".tl-prose")).toBeNull();
  expect(screen.getByText("Console output").tagName).toBe("P");

  const title = screen.getByRole("textbox", { name: "Title" });
  expect(title.tagName).toBe("TEXTAREA");
  expect(title.classList.contains("tl-issue-title")).toBe(true);
  expect(title.getAttribute("aria-invalid")).toBe("true");
  expect(title.getAttribute("aria-describedby")).toBe("title-error");
});

it("IssueLayout reads title, then the Issue fields, then the main column; EditorNotice is an alert; IssueEmpty's action is a button", () => {
  const onAction = vi.fn();
  render(
    <IssueLayout
      title={<h1>Fix login button</h1>}
      side={<p>Status</p>}
      main={
        <>
          <EditorNotice>
            <span>This was changed by Alex Kim.</span>
          </EditorNotice>
          <IssueEmpty
            action="Add one."
            onAction={onAction}>
            No description yet.
          </IssueEmpty>
        </>
      }
    />,
  );

  const title = screen.getByRole("heading", { name: "Fix login button" });
  const fields = screen.getByRole("complementary", { name: "Issue fields" });
  const notice = screen.getByRole("alert");
  expect(title.compareDocumentPosition(fields) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(fields.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(notice.textContent).toBe("This was changed by Alex Kim.");

  const add = screen.getByRole("button", { name: "Add one." });
  expect(add.getAttribute("type")).toBe("button");
  expect(add.parentElement?.textContent).toBe("No description yet. Add one.");
  fireEvent.click(add);
  expect(onAction).toHaveBeenCalledOnce();
});

it("NFR-006: IssueTitleInput's height follows its content, without relying on field-sizing", () => {
  vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(function (
    this: HTMLTextAreaElement,
  ) {
    return this.value.length > 10 ? 96 : 48;
  });
  const { rerender } = render(
    <IssueTitleInput
      aria-label="Title"
      value="Short"
      onChange={() => {}}
    />,
  );
  const title = screen.getByRole("textbox", { name: "Title" });
  expect(title.style.height).toBe("48px");

  rerender(
    <IssueTitleInput
      aria-label="Title"
      value="A much longer title that wraps"
      onChange={() => {}}
    />,
  );
  expect(title.style.height).toBe("96px");
});