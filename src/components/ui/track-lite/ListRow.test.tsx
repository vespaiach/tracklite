import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BoardCard, BoardColumn, BoardEmpty } from "./ListRow";

afterEach(cleanup);

it("BoardCard links its title to the issue, with the handle and ⋯ as separate controls in tab order", () => {
  const onOpen = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
  render(
    <BoardCard
      id="WEB-42"
      title="Fix login button"
      href="/issue/WEB-42"
      onOpen={onOpen}
      handle={<button type="button">Drag WEB-42</button>}
      menu={<button type="button">WEB-42 actions</button>}
      assignee={<span>SL</span>}
      foot={<span>bug</span>}
    />,
  );

  const card = screen.getByRole("article", { name: "Fix login button" });
  const link = within(card).getByRole("link", { name: "Fix login button" });
  expect(link.getAttribute("href")).toBe("/issue/WEB-42");
  expect(card.textContent).toContain("WEB-42");
  expect(card.textContent).toContain("SL");
  expect(card.textContent).toContain("bug");

  const focusable = Array.from(card.querySelectorAll("a, button")).map((element) => element.textContent);
  expect(focusable).toEqual(["Drag WEB-42", "Fix login button", "WEB-42 actions"]);

  fireEvent.click(link);
  expect(onOpen).toHaveBeenCalledTimes(1);
});

it("BoardColumn names its region after the status and shows the count and action", () => {
  render(
    <BoardColumn
      label="In Review"
      count={4}
      action={<button type="button">New issue in In Review</button>}>
      <BoardEmpty>No issues yet.</BoardEmpty>
    </BoardColumn>,
  );

  const column = screen.getByRole("region", { name: "In Review" });
  expect(within(column).getByText("4")).toBeTruthy();
  expect(within(column).getByRole("button", { name: "New issue in In Review" })).toBeTruthy();
  expect(within(column).getByText("No issues yet.")).toBeTruthy();
});