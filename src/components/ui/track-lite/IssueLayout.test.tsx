import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { IssueTitleInput } from "./IssueLayout";

afterEach(cleanup);

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